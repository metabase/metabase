import { Server } from "@hocuspocus/server";
import { Webhook, Events } from "@hocuspocus/extension-webhook";
import { TiptapTransformer } from "@hocuspocus/transformer";

const server = new Server({
  port: 3005,
  extensions: [
    new Webhook({
      url: "http://localhost:3000/api/ee/document/webhook",
      secret: "459824aaffa928e05f5b1caec411ae5f",
      transformer: TiptapTransformer,
      events: [Events.onChange],
      debounce: 2000,
      debounceMaxWait: 10000,
    }),
  ],
});

server.listen();
