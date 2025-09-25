class QuizApp {
    constructor() {
        this.currentUser = null;
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.timer = null;
        this.timeRemaining = 0;
        this.quizStartTime = null;
        this.offlineQuestions = [];
        this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
        this.autoProgressTimer = null;
        
        this.initializeApp();
    }

    initializeApp() {
        this.loadTheme();
        this.updateSoundIcon();
        this.checkAuth();
        this.setupEventListeners();
        this.loadOfflineQuestions();
        setTimeout(() => {
            document.getElementById('loadingScreen').classList.add('hide');
        }, 1500);
    }

    // Theme Management
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = document.querySelector('.theme-icon');
        icon.textContent = theme === 'light' ? '🌙' : '☀️';
    }

    // Authentication
    checkAuth() {
        const user = localStorage.getItem('currentUser');
        if (user) {
            this.currentUser = JSON.parse(user);
            this.showDashboard();
        } else {
            this.showAuthScreen();
        }
    }

    login(username, password) {
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        if (users[username] && users[username].password === password) {
            this.currentUser = users[username];
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            this.showDashboard();
            this.showToast('Login successful!', 'success');
            return true;
        }
        this.showToast('Invalid credentials!', 'error');
        return false;
    }

    signup(username, email, password) {
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        if (users[username]) {
            this.showToast('Username already exists!', 'error');
            return false;
        }
        
        users[username] = {
            username,
            email,
            password,
            stats: {
                totalQuizzes: 0,
                totalScore: 0,
                bestScore: 0,
                points: 0,
                quizHistory: []
            }
        };
        
        localStorage.setItem('users', JSON.stringify(users));
        this.showToast('Account created successfully! Please login.', 'success');
        this.switchToLogin();
        return true;
    }

    logout() {
        localStorage.removeItem('currentUser');
        this.currentUser = null;
        this.showAuthScreen();
        this.showToast('Logged out successfully!', 'info');
    }

    // Screen Management
    showScreen(screenId) {
        this.showScreenWithTransition(screenId);
    }

    showAuthScreen() {
        this.showScreen('authScreen');
        document.getElementById('userInfo').style.display = 'none';
    }

    showDashboard() {
        this.showScreen('dashboardScreen');
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = this.currentUser.username;
        document.getElementById('dashboardUsername').textContent = this.currentUser.username;
        this.updateDashboardStats();
        this.loadLeaderboard();
        this.loadRecentActivity();
    }

    updateDashboardStats() {
        const stats = this.currentUser.stats;
        document.getElementById('totalQuizzes').textContent = stats.totalQuizzes;
        document.getElementById('avgScore').textContent = stats.totalQuizzes > 0 
            ? Math.round(stats.totalScore / stats.totalQuizzes) + '%' 
            : '0%';
        document.getElementById('bestScore').textContent = stats.bestScore + '%';
        document.getElementById('userPoints').textContent = stats.points;
    }

    loadLeaderboard() {
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        const leaderboard = Object.values(users)
            .sort((a, b) => b.stats.points - a.stats.points)
            .slice(0, 5);
        
        const container = document.getElementById('leaderboardPreview');
        container.innerHTML = leaderboard.map((user, index) => `
            <div class="leaderboard-item">
                <span class="leaderboard-rank">${index + 1}</span>
                <span class="leaderboard-name">${user.username}</span>
                <span class="leaderboard-score">${user.stats.points} pts</span>
            </div>
        `).join('');
    }

    loadRecentActivity() {
        const history = this.currentUser.stats.quizHistory.slice(-3);
        const container = document.getElementById('recentActivity');
        
        if (history.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">No recent quizzes</p>';
            return;
        }
        
        container.innerHTML = history.reverse().map(quiz => `
            <div class="activity-item">
                <span class="activity-category">${quiz.category}</span>
                <span class="activity-score">${quiz.score}%</span>
            </div>
        `).join('');
    }

    // Quiz Setup
    async startQuizSetup() {
        this.showScreen('setupScreen');
    }

    async startQuiz(settings) {
        this.showToast('Loading quiz...', 'info');
        
        try {
            const questions = await this.fetchQuestions(settings);
            if (questions.length === 0) {
                this.showToast('No questions available. Try different settings.', 'error');
                return;
            }
            
            this.currentQuiz = {
                questions,
                settings,
                answers: [],
                startTime: Date.now()
            };
            
            this.currentQuestionIndex = 0;
            this.score = 0;
            this.quizStartTime = Date.now();
            
            this.showScreen('quizScreen');
            this.displayQuestion();
        } catch (error) {
            this.showToast('Failed to load quiz. Please try again.', 'error');
            console.error(error);
        }
    }

    async fetchQuestions(settings) {
        const { category, difficulty, numQuestions } = settings;
        let url = `https://opentdb.com/api.php?amount=${numQuestions}&type=multiple`;
        
        if (category) url += `&category=${category}`;
        if (difficulty) url += `&difficulty=${difficulty}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.response_code === 0) {
                return data.results.map(q => ({
                    question: this.decodeHTML(q.question),
                    correct: this.decodeHTML(q.correct_answer),
                    incorrect: q.incorrect_answers.map(a => this.decodeHTML(a)),
                    category: q.category,
                    difficulty: q.difficulty
                }));
            }
            return [];
        } catch (error) {
            // Fallback to offline questions if API fails
            return this.getOfflineQuestions(numQuestions);
        }
    }

    loadOfflineQuestions() {
        this.offlineQuestions = [
            // Geography - Easy
            {
                question: "What is the capital of France?",
                correct: "Paris",
                incorrect: ["London", "Berlin", "Madrid"],
                category: "Geography",
                difficulty: "easy"
            },
            {
                question: "Which continent is Egypt located in?",
                correct: "Africa",
                incorrect: ["Asia", "Europe", "South America"],
                category: "Geography",
                difficulty: "easy"
            },
            {
                question: "What is the largest ocean on Earth?",
                correct: "Pacific Ocean",
                incorrect: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"],
                category: "Geography",
                difficulty: "easy"
            },

            // Geography - Medium
            {
                question: "What is the smallest country in the world?",
                correct: "Vatican City",
                incorrect: ["Monaco", "San Marino", "Liechtenstein"],
                category: "Geography",
                difficulty: "medium"
            },
            {
                question: "Which river flows through Egypt?",
                correct: "Nile River",
                incorrect: ["Amazon River", "Mississippi River", "Yangtze River"],
                category: "Geography",
                difficulty: "medium"
            },

            // Geography - Hard
            {
                question: "What is the capital of Kazakhstan?",
                correct: "Nur-Sultan",
                incorrect: ["Almaty", "Shymkent", "Aktobe"],
                category: "Geography",
                difficulty: "hard"
            },

            // Mathematics - Easy
            {
                question: "What is 2 + 2?",
                correct: "4",
                incorrect: ["3", "5", "6"],
                category: "Mathematics",
                difficulty: "easy"
            },
            {
                question: "What is 10 × 5?",
                correct: "50",
                incorrect: ["45", "55", "60"],
                category: "Mathematics",
                difficulty: "easy"
            },
            {
                question: "What is 100 ÷ 4?",
                correct: "25",
                incorrect: ["20", "30", "24"],
                category: "Mathematics",
                difficulty: "easy"
            },

            // Mathematics - Medium
            {
                question: "What is 15% of 200?",
                correct: "30",
                incorrect: ["25", "35", "40"],
                category: "Mathematics",
                difficulty: "medium"
            },
            {
                question: "What is the square root of 144?",
                correct: "12",
                incorrect: ["11", "13", "14"],
                category: "Mathematics",
                difficulty: "medium"
            },

            // Mathematics - Hard
            {
                question: "What is 7³ (7 to the power of 3)?",
                correct: "343",
                incorrect: ["327", "365", "392"],
                category: "Mathematics",
                difficulty: "hard"
            },

            // Science - Easy
            {
                question: "What is the largest planet in our solar system?",
                correct: "Jupiter",
                incorrect: ["Saturn", "Earth", "Mars"],
                category: "Science",
                difficulty: "easy"
            },
            {
                question: "How many continents are there?",
                correct: "7",
                incorrect: ["6", "5", "8"],
                category: "Science",
                difficulty: "easy"
            },
            {
                question: "What gas do plants absorb from the atmosphere during photosynthesis?",
                correct: "Carbon Dioxide",
                incorrect: ["Oxygen", "Nitrogen", "Hydrogen"],
                category: "Science",
                difficulty: "easy"
            },

            // Science - Medium
            {
                question: "What is the chemical symbol for gold?",
                correct: "Au",
                incorrect: ["Go", "Gd", "Ag"],
                category: "Science",
                difficulty: "medium"
            },
            {
                question: "What is the hardest natural substance on Earth?",
                correct: "Diamond",
                incorrect: ["Quartz", "Steel", "Granite"],
                category: "Science",
                difficulty: "medium"
            },

            // Science - Hard
            {
                question: "What is the speed of light in a vacuum?",
                correct: "299,792,458 m/s",
                incorrect: ["300,000,000 m/s", "250,000,000 m/s", "350,000,000 m/s"],
                category: "Science",
                difficulty: "hard"
            },

            // History - Easy
            {
                question: "In which year did World War II end?",
                correct: "1945",
                incorrect: ["1944", "1946", "1943"],
                category: "History",
                difficulty: "easy"
            },
            {
                question: "Who was the first President of the United States?",
                correct: "George Washington",
                incorrect: ["Thomas Jefferson", "John Adams", "Benjamin Franklin"],
                category: "History",
                difficulty: "easy"
            },

            // History - Medium
            {
                question: "Which empire was ruled by Julius Caesar?",
                correct: "Roman Empire",
                incorrect: ["Greek Empire", "Persian Empire", "Byzantine Empire"],
                category: "History",
                difficulty: "medium"
            },
            {
                question: "In which year did the Berlin Wall fall?",
                correct: "1989",
                incorrect: ["1987", "1990", "1991"],
                category: "History",
                difficulty: "medium"
            },

            // History - Hard
            {
                question: "Who was the last Pharaoh of Egypt?",
                correct: "Cleopatra VII",
                incorrect: ["Nefertiti", "Hatshepsut", "Cleopatra VI"],
                category: "History",
                difficulty: "hard"
            },

            // Literature - Easy
            {
                question: "Who wrote 'Romeo and Juliet'?",
                correct: "William Shakespeare",
                incorrect: ["Charles Dickens", "Jane Austen", "Mark Twain"],
                category: "Literature",
                difficulty: "easy"
            },
            {
                question: "Which book begins with 'It was the best of times, it was the worst of times'?",
                correct: "A Tale of Two Cities",
                incorrect: ["Great Expectations", "Oliver Twist", "David Copperfield"],
                category: "Literature",
                difficulty: "easy"
            },

            // Literature - Medium
            {
                question: "Who wrote '1984'?",
                correct: "George Orwell",
                incorrect: ["Aldous Huxley", "Ray Bradbury", "H.G. Wells"],
                category: "Literature",
                difficulty: "medium"
            },
            {
                question: "Which novel features the character Atticus Finch?",
                correct: "To Kill a Mockingbird",
                incorrect: ["Of Mice and Men", "The Grapes of Wrath", "The Great Gatsby"],
                category: "Literature",
                difficulty: "medium"
            },

            // Literature - Hard
            {
                question: "Who wrote 'One Hundred Years of Solitude'?",
                correct: "Gabriel García Márquez",
                incorrect: ["Mario Vargas Llosa", "Isabel Allende", "Jorge Luis Borges"],
                category: "Literature",
                difficulty: "hard"
            },

            // Sports - Easy
            {
                question: "How many players are on a basketball team on the court at one time?",
                correct: "5",
                incorrect: ["6", "4", "7"],
                category: "Sports",
                difficulty: "easy"
            },
            {
                question: "In which sport would you perform a slam dunk?",
                correct: "Basketball",
                incorrect: ["Volleyball", "Tennis", "Football"],
                category: "Sports",
                difficulty: "easy"
            },

            // Sports - Medium
            {
                question: "Which country has won the most FIFA World Cups?",
                correct: "Brazil",
                incorrect: ["Germany", "Argentina", "Italy"],
                category: "Sports",
                difficulty: "medium"
            },
            {
                question: "In tennis, what does 'love' mean?",
                correct: "Zero points",
                incorrect: ["One point", "Game point", "Set point"],
                category: "Sports",
                difficulty: "medium"
            },

            // Sports - Hard
            {
                question: "Who holds the record for most home runs in a single MLB season?",
                correct: "Barry Bonds",
                incorrect: ["Babe Ruth", "Mark McGwire", "Sammy Sosa"],
                category: "Sports",
                difficulty: "hard"
            },

            // Technology - Easy
            {
                question: "What does 'WWW' stand for?",
                correct: "World Wide Web",
                incorrect: ["World Web Wide", "Wide World Web", "Web Wide World"],
                category: "Technology",
                difficulty: "easy"
            },
            {
                question: "Which company created the iPhone?",
                correct: "Apple",
                incorrect: ["Samsung", "Google", "Microsoft"],
                category: "Technology",
                difficulty: "easy"
            },

            // Technology - Medium
            {
                question: "What does 'CPU' stand for?",
                correct: "Central Processing Unit",
                incorrect: ["Computer Processing Unit", "Central Program Unit", "Computer Program Unit"],
                category: "Technology",
                difficulty: "medium"
            },
            {
                question: "Which programming language is known as the 'language of the web'?",
                correct: "JavaScript",
                incorrect: ["Python", "Java", "C++"],
                category: "Technology",
                difficulty: "medium"
            },

            // Technology - Hard
            {
                question: "Who is credited with inventing the World Wide Web?",
                correct: "Tim Berners-Lee",
                incorrect: ["Bill Gates", "Steve Jobs", "Mark Zuckerberg"],
                category: "Technology",
                difficulty: "hard"
            },

            // Entertainment - Easy
            {
                question: "Which movie features the song 'Let It Go'?",
                correct: "Frozen",
                incorrect: ["Moana", "Tangled", "The Little Mermaid"],
                category: "Entertainment",
                difficulty: "easy"
            },
            {
                question: "Who played Jack in the movie 'Titanic'?",
                correct: "Leonardo DiCaprio",
                incorrect: ["Brad Pitt", "Tom Cruise", "Johnny Depp"],
                category: "Entertainment",
                difficulty: "easy"
            },

            // Entertainment - Medium
            {
                question: "Which TV series features dragons and the Iron Throne?",
                correct: "Game of Thrones",
                incorrect: ["The Witcher", "Lord of the Rings", "Vikings"],
                category: "Entertainment",
                difficulty: "medium"
            },
            {
                question: "Who directed the movie 'Inception'?",
                correct: "Christopher Nolan",
                incorrect: ["Steven Spielberg", "Martin Scorsese", "Quentin Tarantino"],
                category: "Entertainment",
                difficulty: "medium"
            },

            // Entertainment - Hard
            {
                question: "Which actor won an Oscar for playing the Joker in 2019?",
                correct: "Joaquin Phoenix",
                incorrect: ["Heath Ledger", "Jack Nicholson", "Jared Leto"],
                category: "Entertainment",
                difficulty: "hard"
            }
        ];
        localStorage.setItem('offlineQuestions', JSON.stringify(this.offlineQuestions));
    }

    getOfflineQuestions(count) {
        const stored = localStorage.getItem('offlineQuestions');
        const questions = stored ? JSON.parse(stored) : this.offlineQuestions;
        
        // Shuffle and return requested number of questions
        const shuffled = questions.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, questions.length));
    }

    startOfflineQuiz() {
        const settings = {
            numQuestions: 10,
            timePerQuestion: 30,
            category: '',
            difficulty: ''
        };
        
        const questions = this.getOfflineQuestions(settings.numQuestions);
        
        this.currentQuiz = {
            questions,
            settings,
            answers: [],
            startTime: Date.now(),
            offline: true
        };
        
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.quizStartTime = Date.now();
        
        this.showScreen('quizScreen');
        this.displayQuestion();
        this.showToast('Starting offline quiz...', 'info');
    }

    displayQuestion() {
        const question = this.currentQuiz.questions[this.currentQuestionIndex];
        const totalQuestions = this.currentQuiz.questions.length;
        
        // Update progress
        document.getElementById('questionNumber').textContent = 
            `Question ${this.currentQuestionIndex + 1} of ${totalQuestions}`;
        document.getElementById('progressFill').style.width = 
            `${((this.currentQuestionIndex + 1) / totalQuestions) * 100}%`;
        
        document.getElementById('questionText').textContent = question.question;

        const answers = [question.correct, ...question.incorrect]
            .sort(() => 0.5 - Math.random());
        const container = document.getElementById('answersContainer');
        container.innerHTML = answers.map((answer, index) => `
            <button class="answer-option" data-answer="${answer}">
                ${answer}
            </button>
        `).join('');

        this.startTimer();

        document.getElementById('nextQuestion').disabled = true;
        container.querySelectorAll('.answer-option').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectAnswer(e.target));
        });
    }

    startTimer() {
        clearInterval(this.timer);
        const timePerQuestion = this.currentQuiz.settings.timePerQuestion;
        
        if (timePerQuestion === 0) {
            document.getElementById('timer').textContent = '∞';
            return;
        }
        
        this.timeRemaining = timePerQuestion;
        document.getElementById('timer').textContent = this.timeRemaining;
        
        this.timer = setInterval(() => {
            this.timeRemaining--;
            document.getElementById('timer').textContent = this.timeRemaining;
            
            if (this.timeRemaining <= 0) {
                clearInterval(this.timer);
                this.timeUp();
            }
        }, 1000);
    }

    startAutoProgress() {
        const nextButton = document.getElementById('nextQuestion');
        const originalText = nextButton.textContent;
        let countdown = 5;
        
        // Create progress bar for countdown
        const progressBar = document.createElement('div');
        progressBar.className = 'auto-progress-bar';
        progressBar.innerHTML = '<div class="auto-progress-fill"></div>';
        nextButton.appendChild(progressBar);

        if (!document.getElementById('countdown-styles')) {
            const style = document.createElement('style');
            style.id = 'countdown-styles';
            style.textContent = `
                .auto-progress-bar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 3px;
                    background: rgba(255, 255, 255, 0.3);
                    overflow: hidden;
                    border-radius: 0 0 8px 8px;
                }
                .auto-progress-fill {
                    height: 100%;
                    background: rgba(255, 255, 255, 0.8);
                    width: 100%;
                    animation: countdown-progress 5s linear forwards;
                }
                @keyframes countdown-progress {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Update button text with countdown
        const updateCountdown = () => {
            if (countdown > 0) {
                nextButton.textContent = `Auto-advancing in ${countdown}s (or click to skip)`;
                countdown--;
            }
        };
        updateCountdown();
        const countdownInterval = setInterval(updateCountdown, 1000);
        this.autoProgressTimer = setTimeout(() => {
            clearInterval(countdownInterval);
            progressBar.remove();
            nextButton.textContent = originalText;
            if (!nextButton.disabled) {
                this.nextQuestion();
            }
        }, 5000);
        const originalClickHandler = () => {
            clearTimeout(this.autoProgressTimer);
            clearInterval(countdownInterval);
            progressBar.remove();
            nextButton.textContent = originalText;
        };
        nextButton.addEventListener('click', originalClickHandler, { once: true });
    }

    timeUp() {
        this.playSound('timeup');
        const buttons = document.querySelectorAll('.answer-option');
        buttons.forEach(btn => btn.disabled = true);
        
        const correctAnswer = this.currentQuiz.questions[this.currentQuestionIndex].correct;
        buttons.forEach(btn => {
            if (btn.dataset.answer === correctAnswer) {
                btn.classList.add('correct');
            }
        });
        
        this.currentQuiz.answers.push({
            question: this.currentQuiz.questions[this.currentQuestionIndex].question,
            userAnswer: null,
            correctAnswer,
            isCorrect: false
        });
        
        const nextButton = document.getElementById('nextQuestion');
        nextButton.disabled = false;
        this.showToast('Time\'s up! ⏰', 'error');
        this.startAutoProgress();
    }

    selectAnswer(button) {
        if (button.disabled) return;
        
        this.playSound('click');
        clearInterval(this.timer);
        clearTimeout(this.autoProgressTimer);
        
        const buttons = document.querySelectorAll('.answer-option');
        buttons.forEach(btn => btn.disabled = true);
        
        const userAnswer = button.dataset.answer;
        const correctAnswer = this.currentQuiz.questions[this.currentQuestionIndex].correct;
        const isCorrect = userAnswer === correctAnswer;
        
        button.classList.add('selected');
        
        setTimeout(() => {
            if (isCorrect) {
                button.classList.add('correct');
                this.score++;
                this.playSound('correct');
                this.showToast('Correct! 🎉', 'success');
                this.addSparkleEffect(button);
            } else {
                button.classList.add('wrong');
                buttons.forEach(btn => {
                    if (btn.dataset.answer === correctAnswer) {
                        btn.classList.add('correct');
                    }
                });
                this.playSound('wrong');
                this.showToast('Wrong answer! 😞', 'error');
                button.style.animation = 'shake 0.5s';
            }
            
            this.currentQuiz.answers.push({
                question: this.currentQuiz.questions[this.currentQuestionIndex].question,
                userAnswer,
                correctAnswer,
                isCorrect
            });
            
            const nextButton = document.getElementById('nextQuestion');
            nextButton.disabled = false;
            this.startAutoProgress();
        }, 300);
    }

    addSparkleEffect(element) {
        const sparkles = document.createElement('div');
        sparkles.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 1000;
        `;
        element.style.position = 'relative';
        element.appendChild(sparkles);

        for (let i = 0; i < 6; i++) {
            const sparkle = document.createElement('div');
            sparkle.textContent = '✨';
            sparkle.style.cssText = `
                position: absolute;
                animation: sparkle 1s ease-out forwards;
                animation-delay: ${i * 0.1}s;
                font-size: 20px;
                transform: translate(-50%, -50%);
            `;
            sparkles.appendChild(sparkle);
        }

        if (!document.getElementById('sparkle-animation')) {
            const style = document.createElement('style');
            style.id = 'sparkle-animation';
            style.textContent = `
                @keyframes sparkle {
                    0% {
                        transform: translate(-50%, -50%) scale(0) rotate(0deg);
                        opacity: 1;
                    }
                    50% {
                        transform: translate(-50%, -50%) scale(1) rotate(180deg);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(0) rotate(360deg);
                        opacity: 0;
                    }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                    20%, 40%, 60%, 80% { transform: translateX(5px); }
                }
                @keyframes slideOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(-100px); }
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(100px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `;
            document.head.appendChild(style);
        }

        setTimeout(() => {
            sparkles.remove();
        }, 1500);
    }

    nextQuestion() {
        // Clear any existing auto-progress timer
        clearTimeout(this.autoProgressTimer);
        const nextButton = document.getElementById('nextQuestion');
        nextButton.textContent = 'Next Question';
        
        this.currentQuestionIndex++;
        
        if (this.currentQuestionIndex >= this.currentQuiz.questions.length) {
            this.endQuiz();
        } else {
            this.displayQuestion();
        }
    }

    endQuiz() {
        clearInterval(this.timer);
        
        const totalQuestions = this.currentQuiz.questions.length;
        const percentage = Math.round((this.score / totalQuestions) * 100);
        const timeTaken = Math.floor((Date.now() - this.quizStartTime) / 1000);
        const points = this.calculatePoints(percentage, timeTaken);
        this.updateUserStats(percentage, points);
        
        // Display results
        document.getElementById('finalScore').textContent = percentage;
        document.getElementById('correctAnswers').textContent = this.score;
        document.getElementById('wrongAnswers').textContent = totalQuestions - this.score;
        document.getElementById('totalTime').textContent = this.formatTime(timeTaken);
        document.getElementById('pointsEarned').textContent = points;
        if (percentage >= 70) {
            this.playSound('success');
            setTimeout(() => this.createConfetti(), 500);
        }
        
        this.showScreenWithTransition('resultsScreen');
    }

    calculatePoints(percentage, timeTaken) {
        let points = Math.floor(percentage * 10);
        
        // Bonus points for speed
        if (timeTaken < 60) points += 50;
        else if (timeTaken < 120) points += 25;
        else if (timeTaken < 180) points += 10;
        
        // Bonus for difficulty
        const difficulty = this.currentQuiz.settings.difficulty;
        if (difficulty === 'hard') points *= 2;
        else if (difficulty === 'medium') points *= 1.5;
        
        return Math.floor(points);
    }

    updateUserStats(percentage, points) {
        const stats = this.currentUser.stats;
        stats.totalQuizzes++;
        stats.totalScore += percentage;
        stats.bestScore = Math.max(stats.bestScore, percentage);
        stats.points += points;
        stats.quizHistory.push({
            category: this.currentQuiz.settings.category || 'Mixed',
            score: percentage,
            date: new Date().toISOString(),
            points
        });
        if (stats.quizHistory.length > 10) {
            stats.quizHistory = stats.quizHistory.slice(-10);
        }
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        users[this.currentUser.username] = this.currentUser;
        localStorage.setItem('users', JSON.stringify(users));
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    }

    showReview() {
        this.showScreen('reviewScreen');
        const container = document.getElementById('reviewContent');
        
        container.innerHTML = this.currentQuiz.answers.map((answer, index) => `
            <div class="review-item">
                <div class="review-question">
                    Q${index + 1}: ${answer.question}
                </div>
                <div class="review-answers">
                    <div class="review-answer ${answer.userAnswer === answer.correctAnswer ? 'user-correct' : 'user-wrong'}">
                        Your Answer: ${answer.userAnswer || 'Not answered'}
                        ${answer.isCorrect ? '<span class="review-label correct">✓ Correct</span>' : '<span class="review-label wrong">✗ Wrong</span>'}
                    </div>
                    ${!answer.isCorrect ? `
                        <div class="review-answer correct-answer">
                            Correct Answer: ${answer.correctAnswer}
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // Sound Effects
    playSound(type) {
        if (!this.soundEnabled) return;
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Different sounds for different events
            switch (type) {
                case 'correct':
                    // Happy sound - ascending notes
                    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
                    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
                    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.3);
                    break;
                    
                case 'wrong':
                    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
                    oscillator.frequency.setValueAtTime(349.23, audioContext.currentTime + 0.1); // F4
                    oscillator.frequency.setValueAtTime(261.63, audioContext.currentTime + 0.2); // C4
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.4);
                    break;
                    
                case 'timeup':
                    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                    oscillator.type = 'square';
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.2);
                    break;
                    
                case 'success':
                    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
                    frequencies.forEach((freq, index) => {
                        const osc = audioContext.createOscillator();
                        const gain = audioContext.createGain();
                        osc.connect(gain);
                        gain.connect(audioContext.destination);
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0.2, audioContext.currentTime + index * 0.1);
                        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + index * 0.1 + 0.3);
                        osc.start(audioContext.currentTime + index * 0.1);
                        osc.stop(audioContext.currentTime + index * 0.1 + 0.3);
                    });
                    break;
                    
                case 'click':
                    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
                    oscillator.type = 'sine';
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.05);
                    break;
            }
        } catch (error) {
            console.log('Audio not supported');
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        localStorage.setItem('soundEnabled', this.soundEnabled);
        this.updateSoundIcon();
        this.showToast(this.soundEnabled ? 'Sound enabled 🔊' : 'Sound disabled 🔇', 'info');
    }

    updateSoundIcon() {
        const icon = document.querySelector('.sound-icon');
        if (icon) {
            icon.textContent = this.soundEnabled ? '🔊' : '🔇';
        }
    }

    createConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a0e7e5'];
        const confettiContainer = document.createElement('div');
        confettiContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10000;
        `;
        document.body.appendChild(confettiContainer);

        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 10 + 5;
            const left = Math.random() * window.innerWidth;
            const duration = Math.random() * 3 + 2;
            const delay = Math.random() * 2;

            confetti.style.cssText = `
                position: absolute;
                background: ${color};
                width: ${size}px;
                height: ${size}px;
                left: ${left}px;
                top: -10px;
                border-radius: 50%;
                animation: confetti-fall ${duration}s ${delay}s linear forwards;
            `;

            confettiContainer.appendChild(confetti);
        }

        if (!document.getElementById('confetti-animation')) {
            const style = document.createElement('style');
            style.id = 'confetti-animation';
            style.textContent = `
                @keyframes confetti-fall {
                    0% {
                        transform: translateY(-100vh) rotate(0deg);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(100vh) rotate(360deg);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        setTimeout(() => {
            confettiContainer.remove();
        }, 5000);
    }

    // Screen transitions with animations
    showScreenWithTransition(screenId) {
        const currentScreen = document.querySelector('.screen.active');
        const newScreen = document.getElementById(screenId);
        
        if (currentScreen) {
            currentScreen.style.animation = 'slideOut 0.3s ease-in-out forwards';
            setTimeout(() => {
                currentScreen.classList.remove('active');
                currentScreen.style.animation = '';
                newScreen.classList.add('active');
                newScreen.style.animation = 'slideIn 0.3s ease-in-out forwards';
                setTimeout(() => {
                    newScreen.style.animation = '';
                }, 300);
            }, 300);
        } else {
            newScreen.classList.add('active');
            newScreen.style.animation = 'slideIn 0.3s ease-in-out forwards';
        }
    }
    decodeHTML(html) {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    switchToLogin() {
        document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector('[data-tab="login"]').classList.add('active');
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        document.getElementById('loginForm').classList.add('active');
    }

    // Event Listeners Setup
    setupEventListeners() {
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('soundToggle').addEventListener('click', () => this.toggleSound());
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
                document.getElementById(tabName + 'Form').classList.add('active');
            });
        });
        
        // Login form
        document.getElementById('loginFormElement').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            this.login(username, password);
        });
        
        // Signup form
        document.getElementById('signupFormElement').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('signupUsername').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            this.signup(username, email, password);
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Dashboard buttons
        document.getElementById('startQuizBtn').addEventListener('click', () => this.startQuizSetup());
        document.getElementById('offlineQuizBtn').addEventListener('click', () => this.startOfflineQuiz());

        // Setup form
        document.getElementById('quizSetupForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const settings = {
                category: document.getElementById('category').value,
                difficulty: document.getElementById('difficulty').value,
                numQuestions: parseInt(document.getElementById('numQuestions').value),
                timePerQuestion: parseInt(document.getElementById('timePerQuestion').value)
            };
            this.startQuiz(settings);
        });

        document.getElementById('backToDashboard').addEventListener('click', () => this.showDashboard());
        document.getElementById('nextQuestion').addEventListener('click', () => this.nextQuestion());
        document.getElementById('reviewQuiz').addEventListener('click', () => this.showReview());
        document.getElementById('newQuiz').addEventListener('click', () => this.startQuizSetup());
        document.getElementById('backHome').addEventListener('click', () => this.showDashboard());
        document.getElementById('backToResults').addEventListener('click', () => this.showScreen('resultsScreen'));
        document.getElementById('reviewNewQuiz').addEventListener('click', () => this.startQuizSetup());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.quizApp = new QuizApp();
});