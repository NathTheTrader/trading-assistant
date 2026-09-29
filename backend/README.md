# Trading Assistant Bot — Backend

Server-side core for the Trading Assistant.

Modes:
- READ ONLY
- No order placement/cancellation/modification
- No account credentials in the frontend
- NQ/Futures and Crypto are strictly separated
- AI uses the Responses API
- Voice uses server-side transcription + TTS
- Obsidian journal is imported to private backend storage
- Historical screenshot analysis is optional and read-only

Core endpoints:
- GET /health
- GET /api/trades?model=NQ|CRYPTO
- POST /api/trades
- POST /api/analyze-trade
- POST /api/chat
- GET /api/patterns?model=NQ|CRYPTO
- GET /api/history/ai-context?model=NQ|CRYPTO
- GET /api/optimization/daily?model=NQ|CRYPTO
- POST /api/coach/question
- POST /api/voice/turn
- GET /api/learning?model=NQ|CRYPTO

Obsidian:
- GET /api/obsidian/status?model=NQ|CRYPTO
- POST /api/obsidian/import — multipart field `file`, ZIP of the Obsidian vault
- POST /api/obsidian/analyze-images — starts the historical screenshot analysis queue
- GET /api/obsidian/job — progress for the screenshot analysis queue

Required:
- OPENAI_API_KEY

Optional:
- TRADOVATE_* credentials for the read-only Tradovate connector
- OBSIDIAN_DIR=./data/obsidian
- LEARNING_FILE=./data/ai-learning.json
- OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
- OPENAI_TTS_MODEL=gpt-4o-mini-tts
- OPENAI_TTS_VOICE=alloy

Important:
- Do not commit real API keys.
- Do not commit the user's raw Obsidian journal, screenshots, or account credentials to the public GitHub repository.
- The Obsidian ZIP is uploaded through the authenticated/private backend and stored server-side.
- KCEX remains screen-observation/read-only unless an authorized official integration is available.

<!-- CI validation branch -->
