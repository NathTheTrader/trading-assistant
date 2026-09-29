# Trading Assistant Bot — Backend

This is the server-side core for the Trading Assistant.

Modes:
- READ ONLY
- No order placement
- No account credentials in the frontend
- Trade history is stored server-side
- AI analysis uses the Responses API

Endpoints:
- GET /health
- GET /api/trades?model=NQ
- POST /api/trades
- POST /api/analyze-trade
- POST /api/chat
- GET /api/patterns?model=NQ

Required environment:
OPENAI_API_KEY

Do not commit real API keys or personal trading history to the public GitHub repository.

Next integrations:
1. Tradovate read-only account events.
2. Authorized KCEX read-only integration.
3. Persistent database.
4. News/calendar ingestion through an authorized source.
5. Screenshot/image analysis attached to trade records.
6. Live event stream to the frontend.
