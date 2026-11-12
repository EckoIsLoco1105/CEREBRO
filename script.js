(() => {
	"use strict";

	const STORAGE_KEY = "cerebro-study-data-v1";
	const THEME_KEY = "cerebro-theme";
	const TOKEN_KEY = "cerebro-session-token";
	const API_BASE = (window.CEREBRO_API_URL || "").replace(/\/$/, "");
	const colors = { mint: "#86d8b5", coral: "#c98f95", blue: "#7aa7d9", yellow: "#d8c99a" };
	let pickerHue = 154;
	let pickerSaturation = 0.38;
	const sampleQuestions = [
		{ question: "Which approach is most useful when you want to check whether you can recall a concept without looking at your notes?", options: ["Rereading the same paragraph", "Active retrieval practice", "Highlighting every sentence", "Waiting until the night before"], answer: 1, explanation: "Retrieval practice strengthens access to information by asking you to bring it to mind." },
		{ question: "A strong study objective should primarily describe…", options: ["How many pages to read", "What you should be able to explain or do", "The time of day you will study", "Which color to use for notes"], answer: 1, explanation: "Objectives are clearest when they describe an observable understanding or skill." },
		{ question: "Why is it useful to split a large unit into smaller topics?", options: ["It removes the need to review", "It makes progress visible and practice more focused", "It guarantees a perfect score", "It replaces course materials"], answer: 1, explanation: "Smaller topics help you plan focused sessions and identify gaps more precisely." },
		{ question: "After answering a practice question incorrectly, what is the most useful next step?", options: ["Ignore the result", "Review the reasoning and try retrieval again later", "Memorize only the option letter", "Stop studying the subject"], answer: 1, explanation: "Using feedback to correct a misunderstanding turns an error into a useful learning signal." },
		{ question: "A progress dashboard is most valuable when it helps you…", options: ["Compare your progress with strangers", "See what you have reviewed and choose a next step", "Avoid difficult topics", "Replace all quizzes with charts"], answer: 1, explanation: "Progress indicators are most useful when they guide realistic next actions." }
	];
	let state = loadState();
	let activeQuiz = null;
	let authMode = "login";
	let toastTimer;
	let activityChart;
	let scoreChart;

	function loadState() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
			if (saved && Array.isArray(saved.courses) && Array.isArray(saved.quizzes)) return saved;
		} catch (error) { console.warn("Could not read saved study data.", error); }
		return { courses: [], quizzes: [], activity: [] };
	}

	function saveState() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
	}

	function id() {
		return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	function toast(message) {
		const element = document.getElementById("toast-message");
		element.textContent = message;
		element.classList.add("show");
		window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => element.classList.remove("show"), 2800);
	}

	function colorValue(course) { return colors[course.color] || (/^#[0-9a-f]{6}$/i.test(course.color) ? course.color : colors.mint); }
	function hsvToRgb(hue, saturation, value) {
		const chroma = value * saturation;
		const section = hue / 60;
		const second = chroma * (1 - Math.abs(section % 2 - 1));
		const [red, green, blue] = section < 1 ? [chroma, second, 0] : section < 2 ? [second, chroma, 0] : section < 3 ? [0, chroma, second] : section < 4 ? [0, second, chroma] : section < 5 ? [second, 0, chroma] : [chroma, 0, second];
		const offset = value - chroma;
		return [red, green, blue].map(channel => Math.round((channel + offset) * 255));
	}
	function pickerColor() { return `#${hsvToRgb(pickerHue, pickerSaturation, Number(document.getElementById("course-color-brightness").value) / 100).map(channel => channel.toString(16).padStart(2, "0")).join("")}`; }
	function updateCustomColorPreview() {
		const selected = document.querySelector('#course-form input[name="color"]:checked');
		const selectedColor = selected?.value || "mint";
		const preview = document.getElementById("course-color-preview");
		preview.style.backgroundColor = colors[selectedColor] || (/^#[0-9a-f]{6}$/i.test(selectedColor) ? selectedColor : colors.mint);
		const hex = pickerColor();
		document.getElementById("course-color-value").textContent = hex.toUpperCase();
		document.getElementById("course-color-wheel").setAttribute("aria-valuetext", `${hex.toUpperCase()}, saturation ${Math.round(pickerSaturation * 100)} percent`);
		document.getElementById("course-color-wheel").setAttribute("aria-valuenow", String(Math.round(pickerHue)));
		document.getElementById("course-color-brightness").style.setProperty("--brightness-color", `hsl(${pickerHue} ${Math.round(pickerSaturation * 100)}% 50%)`);
	}
	function drawColorWheel() {
		const canvas = document.getElementById("course-color-wheel");
		const context = canvas.getContext("2d");
		const { width, height } = canvas;
		const centerX = width / 2;
		const centerY = height / 2;
		const radius = Math.min(width, height) / 2 - 1;
		const image = context.createImageData(width, height);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const dx = x - centerX;
				const dy = y - centerY;
				const distance = Math.hypot(dx, dy);
				if (distance > radius) continue;
				const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
				const rgb = hsvToRgb(hue, distance / radius, 1);
				const offset = (y * width + x) * 4;
				image.data[offset] = rgb[0];
				image.data[offset + 1] = rgb[1];
				image.data[offset + 2] = rgb[2];
				image.data[offset + 3] = 255;
			}
		}
		context.putImageData(image, 0, 0);
		const markerX = centerX + Math.cos(pickerHue * Math.PI / 180) * pickerSaturation * radius;
		const markerY = centerY + Math.sin(pickerHue * Math.PI / 180) * pickerSaturation * radius;
		context.beginPath();
		context.arc(markerX, markerY, 7, 0, Math.PI * 2);
		context.strokeStyle = "#fff";
		context.lineWidth = 3;
		context.stroke();
		context.beginPath();
		context.arc(markerX, markerY, 8.5, 0, Math.PI * 2);
		context.strokeStyle = "rgba(0,0,0,.7)";
		context.lineWidth = 1;
		context.stroke();
	}
	function updateWheelFromPointer(event) {
		const canvas = event.currentTarget;
		const bounds = canvas.getBoundingClientRect();
		const x = (event.clientX - bounds.left) * canvas.width / bounds.width - canvas.width / 2;
		const y = (event.clientY - bounds.top) * canvas.height / bounds.height - canvas.height / 2;
		pickerHue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
		pickerSaturation = Math.min(1, Math.hypot(x, y) / (Math.min(canvas.width, canvas.height) / 2 - 1));
		const custom = document.getElementById("course-color-custom");
		custom.value = pickerColor();
		custom.checked = true;
		drawColorWheel();
		updateCustomColorPreview();
	}
	function topicCount() { return state.courses.reduce((sum, course) => sum + course.topics.length, 0); }
	function reviewedCount() { return state.courses.reduce((sum, course) => sum + course.topics.filter(topic => topic.reviewed).length, 0); }
	function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }

	function render() {
		renderStats();
		renderDashboardCourses();
		renderCourseList();
		renderQuizHistory();
		renderAnalytics();
		renderActivity();
		document.getElementById("course-count").textContent = state.courses.length;
	}

	function renderStats() {
		const total = topicCount();
		const reviewed = reviewedCount();
		const average = state.quizzes.length ? Math.round(state.quizzes.reduce((sum, quiz) => sum + quiz.score, 0) / state.quizzes.length) : null;
		document.getElementById("stat-reviewed").innerHTML = `${reviewed}<span class="stat-denom"> / ${total}</span>`;
		document.getElementById("reviewed-meter").style.width = `${total ? reviewed / total * 100 : 0}%`;
		document.getElementById("reviewed-caption").textContent = total ? `${Math.round(reviewed / total * 100)}% of topics completed` : "Your progress starts here";
		document.getElementById("stat-average").innerHTML = `${average === null ? "—" : average}<span class="stat-unit">%</span>`;
		document.getElementById("quiz-caption").textContent = average === null ? "Complete a quiz to see your average" : `${state.quizzes.length} attempt${state.quizzes.length === 1 ? "" : "s"} recorded`;
		document.getElementById("stat-courses").textContent = state.courses.length;
		document.getElementById("courses-caption").textContent = state.courses.length ? `${total} topic${total === 1 ? "" : "s"} in your library` : "Add a course to get started";
		document.getElementById("stat-quizzes").textContent = state.quizzes.length;
		const next = document.getElementById("next-step-copy");
		const nextAction = document.getElementById("next-step-action");
		const firstUnreviewed = state.courses.flatMap(course => course.topics.map(topic => ({ course, topic }))).find(item => !item.topic.reviewed);
		if (!state.courses.length) {
			next.textContent = "Add your first course and turn a big syllabus into manageable steps.";
			nextAction.innerHTML = "Create a course <span>→</span>";
		} else if (firstUnreviewed) {
			next.textContent = `A focused review of “${firstUnreviewed.topic.name}” in ${firstUnreviewed.course.name} is a good next step.`;
			nextAction.innerHTML = "Open my courses <span>→</span>";
		} else {
			next.textContent = "You have reviewed every topic. Build a quiz to check what has stuck.";
			nextAction.innerHTML = "Build a quiz <span>→</span>";
		}
	}

	function courseCard(course) {
		const total = course.topics.length;
		const done = course.topics.filter(topic => topic.reviewed).length;
		const percent = total ? Math.round(done / total * 100) : 0;
		const colorLabel = course.color.startsWith("#") ? "Custom" : course.color;
		return `<article class="course-card" style="--course-color:${colorValue(course)}"><div class="course-card-top"><span class="course-tag">${escapeHtml(colorLabel)} course</span><button class="course-menu" data-delete-course="${escapeHtml(course.id)}" title="Delete course" aria-label="Delete ${escapeHtml(course.name)}">×</button></div><h3>${escapeHtml(course.name)}</h3><div class="course-count">${total} topic${total === 1 ? "" : "s"} · ${done} reviewed</div><div class="course-progress-line"><div class="progress-track"><i style="width:${percent}%"></i></div><span>${percent}%</span></div><div class="course-card-actions"><button class="small-action" data-add-topic="${escapeHtml(course.id)}">＋ Add topic</button><button class="small-action" data-edit-course="${escapeHtml(course.id)}">Rename</button><button class="small-action" data-view="courses">View →</button></div></article>`;
	}

	function renderDashboardCourses() {
		const element = document.getElementById("dashboard-courses");
		element.innerHTML = state.courses.length ? state.courses.slice(0, 3).map(courseCard).join("") : `<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">▤</span><strong>Your study library starts here</strong><p>Add a course, organize its modules, and keep track of what you’ve reviewed.</p><button class="button button-primary" data-add-course type="button">＋ Add your first course</button></div>`;
	}

	function renderCourseList() {
		const element = document.getElementById("all-courses");
		if (!state.courses.length) {
			element.innerHTML = `<div class="empty-state"><span class="empty-icon">▤</span><strong>No courses yet</strong><p>Create a course to start building your syllabus checklist.</p><button class="button button-primary" data-add-course type="button">＋ Add course</button></div>`;
			return;
		}
		element.innerHTML = state.courses.map(course => {
			const done = course.topics.filter(topic => topic.reviewed).length;
			const percent = course.topics.length ? Math.round(done / course.topics.length * 100) : 0;
			const topics = course.topics.length ? course.topics.map(topic => `<div class="topic-item ${topic.reviewed ? "is-reviewed" : ""}"><input class="topic-check" type="checkbox" data-toggle-topic="${escapeHtml(course.id)}" data-topic-id="${escapeHtml(topic.id)}" ${topic.reviewed ? "checked" : ""} aria-label="Mark ${escapeHtml(topic.name)} as reviewed"><div class="topic-info"><strong>${escapeHtml(topic.name)}</strong>${topic.objectives ? `<small>${escapeHtml(topic.objectives)}</small>` : ""}</div><div class="topic-actions"><button data-quiz-topic="${escapeHtml(course.id)}" data-topic-id="${escapeHtml(topic.id)}">Quiz</button><button data-edit-topic="${escapeHtml(course.id)}" data-topic-id="${escapeHtml(topic.id)}">Edit</button><button data-delete-topic="${escapeHtml(course.id)}" data-topic-id="${escapeHtml(topic.id)}" aria-label="Delete topic">×</button></div></div>`).join("") : `<div class="topic-item"><div></div><div class="topic-info"><strong>No modules yet</strong><small>Add a topic or study objective to begin.</small></div></div>`;
			const resources = course.resources || [];
			const reviewers = course.reviewers || [];
			const resourceRows = resources.length ? resources.map(resource => `<div class="resource-row"><button class="resource-download" data-download-resource="${escapeHtml(resource.id)}">${escapeHtml(resource.filename)}</button><span>${formatFileSize(resource.fileSize)}</span><button class="small-action delete" data-delete-resource="${escapeHtml(resource.id)}" data-course-id="${escapeHtml(course.id)}" aria-label="Delete ${escapeHtml(resource.filename)}">Remove</button></div>`).join("") : `<p class="resource-empty">PDF, TXT, or Markdown · 10 MB maximum.</p>`;
			const reviewerRows = reviewers.map(reviewer => `<div class="resource-row"><button class="resource-download" data-open-reviewer="${escapeHtml(reviewer.id)}">${escapeHtml(reviewer.title)}</button><button class="small-action delete" data-delete-reviewer="${escapeHtml(reviewer.id)}" data-course-id="${escapeHtml(course.id)}" aria-label="Delete reviewer">Remove</button></div>`).join("");
			return `<article class="course-row" style="--course-color:${colorValue(course)}"><div class="course-row-head"><span class="course-color-block"></span><div class="course-row-title"><h3>${escapeHtml(course.name)}</h3><p>${course.topics.length} topic${course.topics.length === 1 ? "" : "s"} · ${percent}% complete</p></div><button class="small-action delete" data-delete-course="${escapeHtml(course.id)}">Delete course</button></div><div class="topic-list">${topics}</div><button class="add-topic-row" data-add-topic="${escapeHtml(course.id)}">＋ Add a topic</button><section class="course-resources"><div class="resource-heading"><h4>Study resources</h4><div class="resource-actions"><label class="button button-outline resource-upload">Upload file<input type="file" data-upload-resource="${escapeHtml(course.id)}" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" hidden></label><button class="button button-primary" data-create-reviewer="${escapeHtml(course.id)}" ${resources.length ? "" : "disabled"}>Create reviewer</button></div></div><div class="resource-list">${resourceRows}${reviewerRows}</div></section></article>`;
		}).join("");
	}

	function formatFileSize(bytes) {
		if (!Number.isFinite(bytes) || bytes < 0) return "";
		return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
	}

	function requireCloudAccount() {
		if (!API_BASE) {
			toast("Resource uploads need the API enabled in config.js and a signed-in account.");
			return false;
		}
		if (!localStorage.getItem(TOKEN_KEY)) {
			setAuthMode("login");
			openModal("auth-modal");
			toast("Sign in to upload resources and create AI reviewers.");
			return false;
		}
		return true;
	}

	async function uploadCourseResource(courseId, file) {
		const course = state.courses.find(item => item.id === courseId);
		if (!course || !requireCloudAccount()) return;
		if (file.size > 10 * 1024 * 1024) {
			toast("Choose a file smaller than 10 MB.");
			return;
		}
		try {
			const result = await request(`/api/courses/${encodeURIComponent(courseId)}/resources`, {
				method: "POST",
				body: file,
				headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }
			});
			course.resources ||= [];
			course.resources.push(result.resource);
			saveState();
			render();
			toast("Resource uploaded and ready for study.");
		} catch (error) { toast(`Could not upload resource: ${error.message}`); }
	}

	async function createCourseReviewer(courseId) {
		const course = state.courses.find(item => item.id === courseId);
		if (!course || !requireCloudAccount()) return;
		const button = document.querySelector(`[data-create-reviewer="${CSS.escape(courseId)}"]`);
		if (button) button.disabled = true;
		try {
			const result = await request(`/api/courses/${encodeURIComponent(courseId)}/reviewers`, { method: "POST", body: "{}" });
			course.reviewers ||= [];
			course.reviewers.unshift(result.reviewer);
			saveState();
			render();
			showReviewer(result.reviewer);
		} catch (error) { toast(`Could not create reviewer: ${error.message}`); }
		finally { if (button?.isConnected) button.disabled = false; }
	}

	function showReviewer(reviewer) {
		document.getElementById("reviewer-title").textContent = reviewer.title;
		document.getElementById("reviewer-content").textContent = reviewer.content;
		openModal("reviewer-modal");
	}

	async function downloadCourseResource(resourceId) {
		if (!requireCloudAccount()) return;
		try {
			const blob = await request(`/api/course-resources/${encodeURIComponent(resourceId)}/file`, { responseType: "blob" });
			const link = document.createElement("a");
			const resource = state.courses.flatMap(course => course.resources || []).find(item => item.id === resourceId);
			link.href = URL.createObjectURL(blob);
			link.download = resource?.filename || "course-resource";
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
		} catch (error) { toast(`Could not download resource: ${error.message}`); }
	}

	function renderQuizHistory() {
		const element = document.getElementById("quiz-history-list");
		if (!state.quizzes.length) {
			element.innerHTML = `<div class="empty-state" style="border:0;border-radius:0"><span class="empty-icon">◉</span><strong>No quizzes yet</strong><p>Choose a topic and take a short practice quiz.</p><button class="button button-primary" data-start-quiz type="button">✳ Start a quiz</button></div>`;
			return;
		}
		element.innerHTML = [...state.quizzes].reverse().map(quiz => `<div class="history-row"><strong>${escapeHtml(quiz.topicName)}</strong><span>${escapeHtml(quiz.courseName)}</span><span class="score-pill">${quiz.score}%</span><span>${new Date(quiz.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>`).join("");
	}

	function renderAnalytics() {
		const completion = document.getElementById("completion-chart");
		completion.innerHTML = state.courses.length ? state.courses.map(course => {
			const total = course.topics.length;
			const percent = total ? Math.round(course.topics.filter(topic => topic.reviewed).length / total * 100) : 0;
			return `<div class="completion-row"><span>${escapeHtml(course.name)}</span><div class="completion-track"><i style="width:${percent}%;background:${colorValue(course)}"></i></div><b>${percent}%</b></div>`;
		}).join("") : `<div class="empty-state"><span class="empty-icon">▥</span><strong>Nothing to chart yet</strong><p>Your course progress will appear here.</p></div>`;
		updateCharts();
	}

	function renderActivity() {
		const now = new Date();
		const days = Array.from({ length: 7 }, (_, index) => {
			const date = new Date(now);
			date.setDate(now.getDate() - (6 - index));
			const key = todayKey(date);
			const amount = state.activity.filter(item => item.date === key).length;
			return { label: date.toLocaleDateString(undefined, { weekday: "short" }), amount };
		});
		if (window.Chart) {
			if (activityChart) activityChart.destroy();
			activityChart = new Chart(document.getElementById("activity-chart"), {
				type: "bar",
				data: { labels: days.map(day => day.label), datasets: [{ data: days.map(day => day.amount), backgroundColor: days.map(day => day.amount ? "#8fb5d9" : "#263b4e"), borderRadius: 3, maxBarThickness: 28 }] },
				options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `${context.raw} study action${context.raw === 1 ? "" : "s"}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: chartTextColor(), font: { family: "DM Mono", size: 9 } } }, y: { beginAtZero: true, suggestedMax: Math.max(3, ...days.map(day => day.amount)), ticks: { stepSize: 1, precision: 0, color: chartTextColor(), font: { family: "DM Mono", size: 9 } }, grid: { color: chartGridColor() }, border: { display: false } } } }
			});
		}
	}

	function chartTextColor() { return "#9bb0c2"; }
	function chartGridColor() { return "rgba(161, 182, 204, 0.16)"; }

	function updateCharts() {
		if (!window.Chart) return;
		const recent = state.quizzes.slice(-7);
		if (scoreChart) scoreChart.destroy();
		if (!recent.length) {
			document.querySelector(".scores-chart").innerHTML = `<div class="empty-state" style="height:100%"><span class="empty-icon">↗</span><strong>Take a quiz to see your trend</strong><p>Your recent results will show up here.</p></div>`;
			return;
		}
		if (!document.getElementById("scores-chart")) document.querySelector(".scores-chart").innerHTML = `<canvas id="scores-chart" role="img" aria-label="Quiz scores from recent attempts"></canvas>`;
		scoreChart = new Chart(document.getElementById("scores-chart"), {
			type: "bar",
			data: { labels: recent.map((quiz, index) => `${index + 1}`), datasets: [{ data: recent.map(quiz => quiz.score), backgroundColor: "#8fb5d9", borderRadius: 3, maxBarThickness: 34 }] },
			options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `${context.raw}%` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: chartTextColor(), font: { family: "DM Mono", size: 9 } } }, y: { beginAtZero: true, max: 100, ticks: { stepSize: 25, callback: value => `${value}%`, color: chartTextColor(), font: { family: "DM Mono", size: 9 } }, grid: { color: chartGridColor() }, border: { display: false } } } }
		});
	}

	function markActivity() {
		state.activity.push({ date: todayKey() });
		state.activity = state.activity.slice(-120);
	}

	function openModal(name) {
		const element = document.getElementById(name);
		element.classList.add("open");
		element.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
		const input = element.querySelector("input:not([type=hidden]):not([type=radio]), select");
		window.setTimeout(() => input?.focus(), 50);
	}

	function closeModal(name) {
		const element = document.getElementById(name);
		element.classList.remove("open");
		element.setAttribute("aria-hidden", "true");
		if (!document.querySelector(".modal-backdrop.open")) document.body.style.overflow = "";
	}

	function showCourseModal() {
		document.getElementById("course-form").reset();
		pickerHue = 154;
		pickerSaturation = 0.38;
		drawColorWheel();
		updateCustomColorPreview();
		openModal("course-modal");
	}

	function showTopicModal(courseId, topicId = null) {
		const course = state.courses.find(item => item.id === courseId);
		if (!course) return;
		const topic = topicId ? course.topics.find(item => item.id === topicId) : null;
		document.getElementById("topic-form").reset();
		document.getElementById("topic-course-id").value = course.id;
		document.getElementById("topic-course-label").textContent = course.name;
		document.getElementById("topic-modal-title").textContent = topic ? "Edit topic" : "Add a topic";
		document.getElementById("topic-name").value = topic?.name || "";
		document.getElementById("topic-objectives").value = topic?.objectives || "";
		document.getElementById("topic-form").dataset.topicId = topic?.id || "";
		openModal("topic-modal");
	}

	function setView(view) {
		document.querySelectorAll(".view-panel").forEach(panel => panel.classList.toggle("active", panel.id === `view-${view}`));
		document.querySelectorAll(".side-nav [data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === view));
		const label = { dashboard: "Overview", courses: "My courses", quizzes: "Quiz history", analytics: "Insights" }[view] || "Overview";
		document.getElementById("page-label").textContent = label;
		document.getElementById("sidebar").classList.remove("open");
		history.replaceState(null, "", `#${view}`);
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	async function request(path, options = {}) {
		if (!API_BASE) throw new Error("The Node API is not configured.");
		const token = localStorage.getItem(TOKEN_KEY);
		const responseType = options.responseType;
		delete options.responseType;
		const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
		const body = responseType === "blob" ? await response.blob() : await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
		return body;
	}

	function allTopics() {
		return state.courses.flatMap(course => course.topics.map(topic => ({ course, topic })));
	}

	function syncProfile(user) {
		const button = document.getElementById("profile-button");
		const copy = button.querySelector(".profile-copy");
		const name = user?.displayName || user?.display_name || "Student workspace";
		copy.innerHTML = `<strong>${escapeHtml(name)}</strong><small>${user ? "Account synced" : (API_BASE ? "Sign in to sync" : "Local demo mode")}</small>`;
		button.querySelector(".avatar").textContent = name.trim().charAt(0).toUpperCase();
	}

	async function loadAccountData() {
		if (!API_BASE || !localStorage.getItem(TOKEN_KEY)) return;
		try {
			const [courseResult, quizResult, profileResult] = await Promise.all([request("/api/courses"), request("/api/quizzes"), request("/api/me")]);
			state.courses = courseResult.courses.map(course => ({ ...course, id: String(course.id), topics: course.topics.map(topic => ({ ...topic, id: String(topic.id), serverId: String(topic.id), reviewed: Boolean(topic.reviewed) })) }));
			state.quizzes = quizResult.quizzes.map(quiz => ({ ...quiz, date: new Date(quiz.date).toISOString() }));
			syncProfile(profileResult.user);
			saveState();
			render();
			const status = document.getElementById("connection-status");
			status.innerHTML = "<i></i> ACCOUNT SYNCED";
			status.classList.add("connected");
		} catch (error) {
			localStorage.removeItem(TOKEN_KEY);
			syncProfile(null);
			toast(`Could not sync account: ${error.message}`);
		}
	}

	function setAuthMode(mode) {
		authMode = mode;
		const registering = mode === "register";
		document.getElementById("auth-title").textContent = registering ? "Create your account" : "Sign in";
		document.getElementById("display-name-wrap").hidden = !registering;
		document.getElementById("auth-name").required = registering;
		document.getElementById("auth-password").autocomplete = registering ? "new-password" : "current-password";
		document.getElementById("auth-submit").innerHTML = registering ? "Create account <span>→</span>" : "Sign in <span>→</span>";
		document.getElementById("auth-mode-toggle").textContent = registering ? "Already have an account? Sign in" : "Create an account";
	}

	function startQuiz(courseId, topicId) {
		const available = allTopics();
		const chosen = courseId && topicId ? available.find(item => item.course.id === courseId && item.topic.id === topicId) : null;
		if (chosen) return beginQuiz(chosen.course, chosen.topic);
		if (!available.length) {
			toast("Add a course and topic before starting a quiz.");
			setView("courses");
			return;
		}
		const content = document.getElementById("quiz-content");
		content.innerHTML = `<div class="eyebrow">PRACTICE MAKES PROGRESS</div><h2 id="quiz-title">Choose a topic</h2><p class="dialog-subtitle">Select a topic for a five-question practice quiz.</p><select class="quiz-select" id="quiz-topic-select">${available.map(({ course, topic }) => `<option value="${escapeHtml(course.id)}::${escapeHtml(topic.id)}">${escapeHtml(course.name)} · ${escapeHtml(topic.name)}</option>`).join("")}</select><div class="quiz-controls"><span></span><button class="button button-primary" id="begin-selected-quiz">Start quiz <span>→</span></button></div>`;
		openModal("quiz-modal");
		document.getElementById("begin-selected-quiz").addEventListener("click", () => {
			const [selectedCourse, selectedTopic] = document.getElementById("quiz-topic-select").value.split("::");
			const item = available.find(entry => entry.course.id === selectedCourse && entry.topic.id === selectedTopic);
			if (item) beginQuiz(item.course, item.topic);
		});
	}

	async function beginQuiz(course, topic) {
		if (API_BASE && !localStorage.getItem(TOKEN_KEY)) {
			setAuthMode("login");
			openModal("auth-modal");
			toast("Sign in to generate a topic-specific AI quiz.");
			return;
		}
		const content = document.getElementById("quiz-content");
		content.innerHTML = `<div class="eyebrow">PREPARING YOUR PRACTICE</div><h2 id="quiz-title">Building five questions…</h2><p class="dialog-subtitle">${escapeHtml(course.name)} · ${escapeHtml(topic.name)}</p>`;
		openModal("quiz-modal");
		let questions;
		let source = "sample";
		if (API_BASE) {
			try {
				const result = await request("/api/quizzes/generate", { method: "POST", body: JSON.stringify({ topic: topic.name, course: course.name, objectives: topic.objectives || "", courseId: course.id, topicId: topic.serverId || topic.id }) });
				questions = result.questions;
				source = "ai";
			} catch (error) {
				console.error(error);
				toast(`AI quiz unavailable: ${error.message}`);
			}
		}
		if (!Array.isArray(questions) || questions.length !== 5) {
			questions = sampleQuestions.map(question => ({ ...question }));
			source = "sample";
		}
		activeQuiz = { course, topic, questions, source, index: 0, answers: Array(questions.length).fill(null) };
		renderQuestion();
	}

	function renderQuestion(feedback = "") {
		const quiz = activeQuiz;
		if (!quiz) return;
		const question = quiz.questions[quiz.index];
		const letters = ["A", "B", "C", "D"];
		const answered = quiz.answers[quiz.index] !== null;
		const selected = quiz.answers[quiz.index];
		document.getElementById("quiz-content").innerHTML = `<div class="quiz-meta"><span>${escapeHtml(quiz.course.name)} · ${escapeHtml(quiz.topic.name)}</span><span>${quiz.index + 1} / ${quiz.questions.length}</span></div><div class="quiz-progress"><i style="width:${(quiz.index + 1) / quiz.questions.length * 100}%"></i></div><div class="eyebrow">${quiz.source === "ai" ? "GROQ AI PRACTICE" : "SAMPLE PRACTICE · DEMO MODE"}</div><h2 id="quiz-title">${escapeHtml(question.question)}</h2><div class="quiz-options">${question.options.map((option, index) => `<button class="quiz-option" data-answer="${index}" ${answered ? "disabled" : ""}><span class="option-letter">${letters[index]}</span>${escapeHtml(option)}</button>`).join("")}</div>${feedback ? `<div class="quiz-feedback ${selected === question.answer ? "" : "incorrect"}">${feedback}</div>` : ""}<div class="quiz-controls"><button class="button button-outline" id="quit-quiz">Exit</button>${answered ? `<button class="button button-primary" id="next-question">${quiz.index === quiz.questions.length - 1 ? "See results" : "Next question"} <span>→</span></button>` : ""}</div>`;
		document.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => {
			quiz.answers[quiz.index] = Number(button.dataset.answer);
			const correct = quiz.answers[quiz.index] === question.answer;
			renderQuestion(correct ? `That’s right. ${question.explanation || ""}` : `Not quite. The correct answer is ${letters[question.answer]}. ${question.explanation || ""}`);
		}));
		document.getElementById("quit-quiz").addEventListener("click", () => closeModal("quiz-modal"));
		document.getElementById("next-question")?.addEventListener("click", advanceQuiz);
	}

	async function advanceQuiz() {
		if (activeQuiz.index < activeQuiz.questions.length - 1) {
			activeQuiz.index += 1;
			renderQuestion();
			return;
		}
		const quiz = activeQuiz;
		const correctCount = quiz.answers.reduce((sum, answer, index) => sum + (answer === quiz.questions[index].answer ? 1 : 0), 0);
		const score = Math.round(correctCount / quiz.questions.length * 100);
		state.quizzes.push({ id: id(), courseId: quiz.course.id, topicId: quiz.topic.id, courseName: quiz.course.name, topicName: quiz.topic.name, score, date: new Date().toISOString(), source: quiz.source });
		markActivity();
		saveState();
		render();
		if (API_BASE) {
			try { await request("/api/quizzes", { method: "POST", body: JSON.stringify({ topicId: quiz.topic.serverId || null, topicName: quiz.topic.name, courseName: quiz.course.name, score, total: quiz.questions.length, source: quiz.source === "ai" ? "groq" : "sample" }) }); }
			catch (error) { console.warn("Quiz score could not be synced to the API.", error); }
		}
		document.getElementById("quiz-content").innerHTML = `<div class="quiz-result"><div class="eyebrow">PRACTICE COMPLETE</div><div class="result-ring">${score}%</div><h2 id="quiz-title">${score >= 80 ? "Strong understanding." : score >= 60 ? "Good progress." : "You found a place to focus."}</h2><p>You answered ${correctCount} of ${quiz.questions.length} questions correctly${quiz.source === "sample" ? ". These were sample questions; connect the Node API to generate topic-specific quizzes with Groq." : ". Keep reviewing and test yourself again soon."}</p><button class="button button-primary" id="finish-quiz">Back to workspace <span>→</span></button></div>`;
		document.getElementById("finish-quiz").addEventListener("click", () => closeModal("quiz-modal"));
		activeQuiz = null;
	}

	document.addEventListener("click", async event => {
		const target = event.target.closest("button, a, input[type=checkbox]");
		if (!target) return;
		if (target.matches("[data-close]")) closeModal(target.dataset.close);
		if (target.matches("[data-add-course], #add-course-top, #add-course-main")) showCourseModal();
		if (target.matches("[data-add-topic]")) showTopicModal(target.dataset.addTopic);
		if (target.matches("[data-view]")) { event.preventDefault(); setView(target.dataset.view); }
		if (target.matches("[data-goto]")) setView(target.dataset.goto);
		if (target.matches("[data-start-quiz], #start-quiz-hero, #start-quiz-history")) startQuiz();
		if (target.matches("[data-quiz-topic]")) startQuiz(target.dataset.quizTopic, target.dataset.topicId);
		if (target.matches("[data-create-reviewer]")) await createCourseReviewer(target.dataset.createReviewer);
		if (target.matches("[data-download-resource]")) await downloadCourseResource(target.dataset.downloadResource);
		if (target.matches("[data-open-reviewer]")) {
			if (requireCloudAccount()) {
				try {
					const { reviewer } = await request(`/api/course-reviewers/${encodeURIComponent(target.dataset.openReviewer)}`);
					showReviewer(reviewer);
				} catch (error) { toast(`Could not load reviewer: ${error.message}`); }
			}
		}
		if (target.matches("[data-delete-resource]")) {
			const course = state.courses.find(item => item.id === target.dataset.courseId);
			if (course && window.confirm("Delete this uploaded resource?")) {
				try {
					await request(`/api/course-resources/${encodeURIComponent(target.dataset.deleteResource)}`, { method: "DELETE" });
					course.resources = (course.resources || []).filter(resource => resource.id !== target.dataset.deleteResource);
					saveState(); render(); toast("Resource deleted.");
				} catch (error) { toast(`Could not delete resource: ${error.message}`); }
			}
		}
		if (target.matches("[data-delete-reviewer]")) {
			const course = state.courses.find(item => item.id === target.dataset.courseId);
			if (course && window.confirm("Delete this saved reviewer?")) {
				try {
					await request(`/api/course-reviewers/${encodeURIComponent(target.dataset.deleteReviewer)}`, { method: "DELETE" });
					course.reviewers = (course.reviewers || []).filter(reviewer => reviewer.id !== target.dataset.deleteReviewer);
					saveState(); render(); toast("Reviewer deleted.");
				} catch (error) { toast(`Could not delete reviewer: ${error.message}`); }
			}
		}
		if (target.matches("[data-edit-topic]")) showTopicModal(target.dataset.editTopic, target.dataset.topicId);
		if (target.matches("[data-edit-course]")) {
			const course = state.courses.find(item => item.id === target.dataset.editCourse);
			const name = course && window.prompt("Rename course", course.name)?.trim();
			if (course && name && name !== course.name) {
				try {
					if (API_BASE && localStorage.getItem(TOKEN_KEY)) await request(`/api/courses/${encodeURIComponent(course.id)}`, { method: "PUT", body: JSON.stringify({ name, color: course.color }) });
					course.name = name; saveState(); render(); toast("Course updated.");
				} catch (error) { toast(`Could not update course: ${error.message}`); }
			}
		}
		if (target.matches("[data-delete-course]")) {
			const course = state.courses.find(item => item.id === target.dataset.deleteCourse);
			if (course && window.confirm(`Delete “${course.name}” and its topics, resources, and reviewers?`)) {
				try { if (API_BASE && localStorage.getItem(TOKEN_KEY)) await request(`/api/courses/${encodeURIComponent(course.id)}`, { method: "DELETE" }); }
				catch (error) { toast(`Could not delete course: ${error.message}`); return; }
				state.courses = state.courses.filter(item => item.id !== course.id); saveState(); render(); toast("Course deleted.");
			}
		}
		if (target.matches("[data-delete-topic]")) {
			const course = state.courses.find(item => item.id === target.dataset.deleteTopic);
			const topic = course?.topics.find(item => item.id === target.dataset.topicId);
			if (course && topic) {
				try { if (API_BASE && localStorage.getItem(TOKEN_KEY)) await request(`/api/topics/${encodeURIComponent(topic.serverId || topic.id)}`, { method: "DELETE" }); }
				catch (error) { toast(`Could not delete topic: ${error.message}`); return; }
				course.topics = course.topics.filter(item => item.id !== topic.id); saveState(); render(); toast("Topic deleted.");
			}
		}
		if (target.matches("#auth-mode-toggle")) setAuthMode(authMode === "login" ? "register" : "login");
		if (target.matches("#next-step-action")) {
			if (!state.courses.length) showCourseModal();
			else if (reviewedCount() === topicCount() && topicCount()) startQuiz();
			else setView("courses");
		}
	});

	document.addEventListener("change", event => {
		const upload = event.target.closest("[data-upload-resource]");
		if (upload) {
			const [file] = upload.files;
			if (file) uploadCourseResource(upload.dataset.uploadResource, file);
			upload.value = "";
			return;
		}
		const checkbox = event.target.closest("[data-toggle-topic]");
		if (!checkbox) return;
		const course = state.courses.find(item => item.id === checkbox.dataset.toggleTopic);
		const topic = course?.topics.find(item => item.id === checkbox.dataset.topicId);
		if (topic) {
			const previousValue = topic.reviewed;
			topic.reviewed = checkbox.checked;
			const save = API_BASE && localStorage.getItem(TOKEN_KEY) ? request(`/api/topics/${encodeURIComponent(topic.serverId || topic.id)}`, { method: "PUT", body: JSON.stringify({ name: topic.name, objectives: topic.objectives || "", reviewed: topic.reviewed }) }) : Promise.resolve();
			save.then(() => { if (checkbox.checked) markActivity(); saveState(); render(); }).catch(error => { topic.reviewed = previousValue; render(); toast(`Could not update topic: ${error.message}`); });
		}
	});

	const colorWheel = document.getElementById("course-color-wheel");
	colorWheel.addEventListener("pointerdown", event => {
		colorWheel.setPointerCapture(event.pointerId);
		updateWheelFromPointer(event);
	});
	colorWheel.addEventListener("pointermove", event => {
		if (colorWheel.hasPointerCapture(event.pointerId)) updateWheelFromPointer(event);
	});
	colorWheel.addEventListener("keydown", event => {
		const hueSteps = { ArrowRight: 2, ArrowUp: 0, ArrowLeft: -2, ArrowDown: 0 };
		if (!(event.key in hueSteps)) return;
		event.preventDefault();
		if (event.key === "ArrowUp") pickerSaturation = Math.min(1, pickerSaturation + 0.02);
		else if (event.key === "ArrowDown") pickerSaturation = Math.max(0, pickerSaturation - 0.02);
		else pickerHue = (pickerHue + hueSteps[event.key] + 360) % 360;
		const custom = document.getElementById("course-color-custom");
		custom.value = pickerColor();
		custom.checked = true;
		drawColorWheel();
		updateCustomColorPreview();
	});
	document.getElementById("course-color-brightness").addEventListener("input", () => {
		const custom = document.getElementById("course-color-custom");
		custom.value = pickerColor();
		custom.checked = true;
		drawColorWheel();
		updateCustomColorPreview();
	});
	document.querySelectorAll('#course-form input[name="color"]').forEach(input => input.addEventListener("change", updateCustomColorPreview));
	drawColorWheel();
	updateCustomColorPreview();

	document.getElementById("course-form").addEventListener("submit", event => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const course = { id: id(), name: String(form.get("name")).trim(), color: String(form.get("color") || "mint"), topics: [] };
		if (!course.name) return;
		if (API_BASE && localStorage.getItem(TOKEN_KEY)) {
			const submit = event.submitter;
			submit.disabled = true;
			request("/api/courses", { method: "POST", body: JSON.stringify({ name: course.name, color: course.color }) }).then(({ course: created }) => {
				state.courses.push({ ...created, id: String(created.id), topics: [] }); markActivity(); saveState(); render(); closeModal("course-modal"); toast("Course synced. Add your first topic."); setView("courses"); showTopicModal(String(created.id));
			}).catch(error => toast(`Could not create course: ${error.message}`)).finally(() => { submit.disabled = false; });
			return;
		}
		state.courses.push(course);
		markActivity();
		saveState(); render(); closeModal("course-modal"); toast("Course created. Add your first topic.");
		setView("courses");
		showTopicModal(course.id);
	});

	document.getElementById("topic-form").addEventListener("submit", event => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const course = state.courses.find(item => item.id === document.getElementById("topic-course-id").value);
		if (!course) return;
		const topicId = event.currentTarget.dataset.topicId;
		const existing = course.topics.find(item => item.id === topicId);
		const topic = { ...(existing || { id: id(), reviewed: false }), name: String(form.get("name")).trim(), objectives: String(form.get("objectives") || "").trim() };
		if (!topic.name) return;
		if (API_BASE && localStorage.getItem(TOKEN_KEY)) {
			const submit = event.submitter;
			const path = existing ? `/api/topics/${encodeURIComponent(existing.serverId || existing.id)}` : `/api/courses/${encodeURIComponent(course.id)}/topics`;
			const method = existing ? "PUT" : "POST";
			submit.disabled = true;
			request(path, { method, body: JSON.stringify({ name: topic.name, objectives: topic.objectives, reviewed: topic.reviewed }) }).then(result => {
				if (existing) Object.assign(existing, topic);
				else course.topics.push({ ...result.topic, id: String(result.topic.id), serverId: String(result.topic.id) });
				markActivity(); saveState(); render(); closeModal("topic-modal"); toast(existing ? "Topic synced." : "Topic added and synced.");
			}).catch(error => toast(`Could not save topic: ${error.message}`)).finally(() => { submit.disabled = false; });
			return;
		}
		if (existing) Object.assign(existing, topic);
		else course.topics.push(topic);
		markActivity(); saveState(); render(); closeModal("topic-modal"); toast(existing ? "Topic updated." : "Topic added.");
	});

	document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
	document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => { if (event.target === backdrop) closeModal(backdrop.id); }));
	document.addEventListener("keydown", event => { if (event.key === "Escape") document.querySelectorAll(".modal-backdrop.open").forEach(modal => closeModal(modal.id)); });
	document.getElementById("mobile-menu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
	document.getElementById("theme-toggle").addEventListener("click", () => {
		document.body.classList.toggle("dark");
		localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
		renderActivity(); updateCharts();
	});
	document.getElementById("profile-button").addEventListener("click", () => {
		if (localStorage.getItem(TOKEN_KEY)) {
			if (window.confirm("Sign out of your C.E.R.E.B.R.O account?")) {
				localStorage.removeItem(TOKEN_KEY);
				state = { courses: [], quizzes: [], activity: [] };
				localStorage.removeItem(STORAGE_KEY);
				syncProfile(null); render(); toast("Signed out. Account data was cleared from this browser.");
			}
			return;
		}
		if (!API_BASE) { toast("Local demo mode: configure the API URL to enable accounts and cloud sync."); return; }
		setAuthMode("login"); openModal("auth-modal");
	});

	document.getElementById("auth-form").addEventListener("submit", async event => {
		event.preventDefault();
		if (!API_BASE) return toast("Set the API URL in config.js first.");
		const submit = document.getElementById("auth-submit");
		submit.disabled = true;
		const form = new FormData(event.currentTarget);
		const payload = { email: String(form.get("email")).trim(), password: String(form.get("password")) };
		if (authMode === "register") payload.displayName = String(form.get("displayName")).trim();
		try {
			const result = await request(`/api/auth/${authMode === "register" ? "register" : "login"}`, { method: "POST", body: JSON.stringify(payload) });
			localStorage.setItem(TOKEN_KEY, result.token);
			syncProfile(result.user);
			closeModal("auth-modal");
			await loadAccountData();
			toast("Account connected. Your study space is synced.");
		} catch (error) { toast(error.message); }
		finally { submit.disabled = false; }
	});

	document.getElementById("today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
	if (localStorage.getItem(THEME_KEY) === "dark") document.body.classList.add("dark");
	const initialView = location.hash.replace("#", "");
	if (["dashboard", "courses", "quizzes", "analytics"].includes(initialView)) setView(initialView);
	render();
	if (API_BASE) {
		syncProfile(null);
		fetch(`${API_BASE}/api/health`).then(response => { if (response.ok) { const status = document.getElementById("connection-status"); status.innerHTML = "<i></i> API CONNECTED"; status.classList.add("connected"); loadAccountData(); } }).catch(() => toast("API is not reachable. Demo data remains available."));
	}
})();
