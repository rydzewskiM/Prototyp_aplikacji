# BookFlow Vector Search

Wariant z embeddingami i wyszukiwaniem wektorowym.

## Co zawiera
- PostgreSQL + `pgvector`
- jedna aplikacja Node.js serwująca UI i API
- import 1000 książek z `baza_ksiazek_unikalna.txt`
- import 1000 rekordów RAG z `rag_baza_ksiazek.xlsx`
- lokalne embeddingi demonstracyjne 64D generowane po stronie backendu
- wyszukiwanie wektorowe dla:
  - katalogu książek
  - chatbota RAG

## Uwaga
Ten wariant używa **lokalnych, deterministycznych embeddingów demo** zamiast zewnętrznego modelu embeddingowego. Dzięki temu działa od razu po uruchomieniu i nie wymaga klucza API. Architektura jest gotowa do późniejszej podmiany funkcji `makeEmbedding(...)` na embeddingi modelowe.

## Uruchomienie
```bash
docker compose up --build
```

Aplikacja:
- http://localhost:8080

## Konta demo
- admin@bookflow.pl / admin123
- klient@bookflow.pl / klient123

## Główne endpointy
- `GET /api/health`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `GET /api/books`
- `GET /api/books/:id`
- `GET /api/bestsellers`
- `POST /api/chat`
- `GET /api/orders`
- `POST /api/orders`
- `PUT /api/orders/:orderNo/status`

## Gdzie jest wyszukiwanie wektorowe
- `books.embedding vector(64)`
- `rag_chunks.embedding vector(64)`
- wyszukiwanie używa operatora cosine distance z `pgvector`

## Następny krok
Podmień `makeEmbedding(...)` w `backend/server.js` na embeddingi modelowe, np. z:
- OpenAI embeddings
- local sentence-transformers
- Ollama embeddings


## VERIFIED BUILD V2

Ta paczka ma widoczny znacznik:
- w nagłówku strony: `Verified Build V2`
- w sekcji sesji: `VERIFIED_BUILD_V2`

Jeżeli po uruchomieniu tego nie widać, uruchamiasz starszy obraz albo starszą paczkę.

### Czysty start

```bash
docker compose down -v --remove-orphans
docker compose build --no-cache
docker compose up
```
