document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const modelSelect = document.getElementById('model-select');
    const subjectSelect = document.getElementById('subject');
    const difficultySelect = document.getElementById('difficulty');
    const generateBtn = document.getElementById('generate-btn');
    const questionsList = document.getElementById('questions-list');
    const actionBar = document.getElementById('action-bar');
    const checkAllBtn = document.getElementById('check-all-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const timerDisplay = document.getElementById('timer-display');
    const timeLeftSpan = document.getElementById('time-left');

    let currentQuestions = [];
    let selectedOptions = []; // Array to store user's selected option index for each question
    let isLoading = false;
    let timerInterval = null;
    let timeRemaining = 0;
    let currentAbortController = null;

    // Load API key and model from local storage if available
    const savedApiKey = localStorage.getItem('openrouter_api_key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }
    const savedModel = localStorage.getItem('openrouter_model');
    if (savedModel) {
        modelSelect.value = savedModel;
    }

    // Save API key and model on change
    apiKeyInput.addEventListener('change', (e) => {
        localStorage.setItem('openrouter_api_key', e.target.value.trim());
    });
    modelSelect.addEventListener('change', (e) => {
        localStorage.setItem('openrouter_model', e.target.value);
    });

    generateBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('Silakan masukkan OpenRouter API Key terlebih dahulu.');
            return;
        }

        if (isLoading) return;

        const subject = subjectSelect.value;
        const difficulty = difficultySelect.value === 'any' ? 'acak' : difficultySelect.value;
        const selectedModel = modelSelect.value;

        setLoadingState(true);

        try {
            const questionsData = await fetchQuestionsFromOpenRouter(apiKey, selectedModel, subject, difficulty);
            
            // Validate returned data is an array
            if (!Array.isArray(questionsData.questions)) {
                throw new Error("Invalid response format. Expected an array of questions.");
            }
            
            currentQuestions = questionsData.questions.map(q => {
                if (!q.difficulty) {
                    q.difficulty = difficultySelect.value === 'any' ? 'medium' : difficultySelect.value;
                }
                return q;
            });
            
            selectedOptions = new Array(currentQuestions.length).fill(null);
            renderQuestions();
            startTimer(currentQuestions.length * 90); // 90 seconds per question
        } catch (error) {
            console.error(error);
            alert('Gagal menghasilkan pertanyaan. Periksa API Key Anda atau coba lagi nanti.\nError: ' + error.message);
        } finally {
            setLoadingState(false);
        }
    });

    function startTimer(seconds) {
        clearInterval(timerInterval);
        timeRemaining = seconds;
        timerDisplay.style.display = 'block';
        timerDisplay.classList.remove('warning');
        updateTimerDisplay();

        timerInterval = setInterval(() => {
            timeRemaining--;
            updateTimerDisplay();

            if (timeRemaining <= 60) {
                timerDisplay.classList.add('warning');
            }

            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                alert("Waktu habis! Jawaban Anda akan diperiksa secara otomatis.");
                checkAllBtn.click();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
        const s = (timeRemaining % 60).toString().padStart(2, '0');
        timeLeftSpan.textContent = `${m}:${s}`;
    }

    function setLoadingState(loading) {
        isLoading = loading;
        if (loading) {
            generateBtn.textContent = 'Menghasilkan 5 Soal...';
            generateBtn.disabled = true;
            generateBtn.style.opacity = '0.7';
            
            clearInterval(timerInterval);
            timerDisplay.style.display = 'none';
            questionsList.innerHTML = `
                <div style="text-align:center; padding: 2rem;">
                    <div class="spinner"></div>
                    <div>Sedang membuat soal... (Ini mungkin memakan waktu hingga 30 detik)</div>
                </div>
            `;
            actionBar.style.display = 'none';
            exportPdfBtn.style.display = 'none';
        } else {
            generateBtn.textContent = 'Buat Pertanyaan Baru';
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
        }
    }

    async function fetchQuestionsFromOpenRouter(apiKey, modelId, subject, difficulty) {
        const subjectName = subject === 'biology' ? 'Biologi' : 'Fisika';
        
        const promptText = `Anda adalah pembuat soal ahli untuk Olimpiade Sains Nasional (OSN) IPA tingkat Sekolah Dasar (SD) di Indonesia.
Buatkan tepat 5 (lima) soal pilihan ganda baru yang menantang dan relevan untuk mata pelajaran ${subjectName} dengan tingkat kesulitan ${difficulty}.
SANGAT PENTING: Masing-masing dari ke-5 soal tersebut HARUS mencakup aspek/sub-topik yang BERBEDA dari silabus ${subjectName} agar bervariasi.

Pastikan soal yang Anda buat MENGACU SECARA KETAT pada SILABUS OSN IPA SD berikut ini:
${silabusText}

Berikan jawaban HANYA dalam format JSON yang valid tanpa teks tambahan atau format markdown. Gunakan struktur JSON persis seperti berikut (mengembalikan objek dengan properti "questions" yang berisi array 5 objek soal):
{
  "questions": [
    {
      "topic": "Nama aspek/sub-topik singkat dari silabus",
      "question": "Teks pertanyaan di sini...",
      "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "correctAnswer": 0, 
      "explanation": "Penjelasan detail mengapa jawaban tersebut benar, serta mengapa pilihan lain salah, berdasarkan silabus di atas."
    }
  ]
}
Catatan: correctAnswer adalah indeks dari array options (0 untuk A, 1 untuk B, 2 untuk C, 3 untuk D). Hasilkan tepat 5 objek dalam array questions.`;

        currentAbortController = new AbortController();
        const timeoutId = setTimeout(() => currentAbortController.abort(), 60000); // 60 seconds timeout

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                signal: currentAbortController.signal,
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'user', content: promptText }
                    ],
                    response_format: { type: 'json_object' }
                })
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'API request failed');
            }

            const data = await response.json();
            let content = data.choices[0].message.content;
            
            // Remove markdown block if model included it
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(content);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error("Waktu permintaan habis (Timeout). API terlalu lama merespons.");
            }
            throw error;
        } finally {
            currentAbortController = null;
        }
    }

    function renderQuestions() {
        questionsList.innerHTML = '';
        
        currentQuestions.forEach((q, qIndex) => {
            const validDiff = ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium';
            const diffText = q.difficulty === 'easy' ? 'Mudah' : q.difficulty === 'medium' ? 'Sedang' : q.difficulty === 'hard' ? 'Sulit' : 'Acak';
            
            const qContainer = document.createElement('div');
            qContainer.className = 'question-container active';
            qContainer.style.display = 'block';
            
            qContainer.innerHTML = `
                <div class="badge-container">
                    <span class="badge badge-subject">Soal ${qIndex + 1} - ${q.topic || 'OSN IPA'}</span>
                    <span class="badge badge-${validDiff}">${diffText}</span>
                </div>
                
                <div class="question-text">
                    ${q.question}
                </div>

                <div class="options" id="options-container-${qIndex}"></div>

                <div class="feedback-container" id="feedback-container-${qIndex}">
                    <h4 id="feedback-title-${qIndex}"></h4>
                    <p id="feedback-text-${qIndex}"></p>
                </div>
            `;
            
            questionsList.appendChild(qContainer);
            
            // Render Options
            const optionsContainer = document.getElementById(`options-container-${qIndex}`);
            const letters = ['A', 'B', 'C', 'D'];
            
            q.options.forEach((opt, optIndex) => {
                const optionEl = document.createElement('div');
                optionEl.className = 'option';
                optionEl.innerHTML = `
                    <div class="option-letter">${letters[optIndex]}</div>
                    <div class="option-text">${opt}</div>
                `;
                
                optionEl.addEventListener('click', () => selectOption(qIndex, optIndex, optionEl, optionsContainer));
                optionsContainer.appendChild(optionEl);
            });
        });
        
        actionBar.style.display = 'flex';
        checkAllBtn.style.display = 'block';
        checkAllBtn.disabled = true;
        checkAllBtn.style.opacity = '0.5';
        exportPdfBtn.style.display = 'none';
    }

    function selectOption(qIndex, optIndex, element, container) {
        // Prevent selection if already checked (timer stopped means checked)
        if (checkAllBtn.style.display === 'none') return;

        // Remove selection from all in this specific question
        const allOptions = container.querySelectorAll('.option');
        allOptions.forEach(opt => opt.classList.remove('selected'));

        // Add to current
        element.classList.add('selected');
        selectedOptions[qIndex] = optIndex;

        // Enable check all button if all questions answered
        if (selectedOptions.every(val => val !== null)) {
            checkAllBtn.disabled = false;
            checkAllBtn.style.opacity = '1';
        }
    }

    checkAllBtn.addEventListener('click', () => {
        if (!selectedOptions.every(val => val !== null)) {
            alert("Harap jawab semua soal terlebih dahulu!");
            return;
        }

        currentQuestions.forEach((q, qIndex) => {
            const container = document.getElementById(`options-container-${qIndex}`);
            const allOptions = container.querySelectorAll('.option');
            const selectedOptIndex = selectedOptions[qIndex];
            const isCorrect = selectedOptIndex === q.correctAnswer;

            // Reveal answers
            allOptions.forEach((opt, idx) => {
                if (idx === q.correctAnswer) {
                    opt.classList.add('correct');
                } else if (idx === selectedOptIndex && !isCorrect) {
                    opt.classList.add('wrong');
                }
                opt.style.pointerEvents = 'none'; // Disable further clicking
            });

            // Show feedback
            const feedbackContainer = document.getElementById(`feedback-container-${qIndex}`);
            const feedbackTitle = document.getElementById(`feedback-title-${qIndex}`);
            const feedbackText = document.getElementById(`feedback-text-${qIndex}`);

            feedbackContainer.classList.add('active');

            if (isCorrect) {
                feedbackTitle.textContent = '✅ Jawaban Benar!';
                feedbackTitle.style.color = 'var(--success)';
                feedbackContainer.style.borderLeftColor = 'var(--success)';
            } else {
                feedbackTitle.textContent = '❌ Jawaban Salah!';
                feedbackTitle.style.color = 'var(--danger)';
                feedbackContainer.style.borderLeftColor = 'var(--danger)';
            }

            feedbackText.textContent = q.explanation;
        });

        // Hide check all button after checking, show export button, stop timer
        clearInterval(timerInterval);
        checkAllBtn.style.display = 'none';
        exportPdfBtn.style.display = 'block';
    });

    exportPdfBtn.addEventListener('click', () => {
        window.print();
    });
});
