// src/mocks.js
// 1. Import the library.
import { setupWorker, rest } from "msw";

// 2. Describe network behavior with request handlers.
const worker = setupWorker(
  rest.get("/api/database", (req, res, ctx) => {
    return res(
      // ctx.delay(500),
      ctx.status(500),
      ctx.json({ message: "This is not the error you're looking for" }),
      // ctx.json({ ...REAL_DATABASE_RESPONSE, details: null }),
      // ctx.json(REAL_DATABASE_RESPONSE),
    );
  }),
);

// 3. Start request interception by starting the Service Worker.
worker.start();
