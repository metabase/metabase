import { Server } from "@hocuspocus/server";
import { Webhook, Events } from "@hocuspocus/extension-webhook";
import { TiptapTransformer } from "@hocuspocus/transformer";
import * as Y from "yjs";

class WebhookWithBin extends Webhook {
    async onLoadDocument(data) {
        if (!this.configuration.events.includes(Events.onCreate)) {
            return;
        }

        try {
            const response = await this.sendRequest("load", {
                documentName: data.documentName,
                requestHeaders: data.requestHeaders,
                requestParameters: Object.fromEntries(data.requestParameters.entries()),
            });

            if (response.status !== 200 || !response.data) return;

            const document =
                typeof response.data === "string"
                    ? JSON.parse(response.data)
                    : response.data;

            if (document.ydoc) {
                Y.applyUpdate(data.document, Buffer.from(document.ydoc, "base64"))
            } else if (document.document) {
                for (const fieldName in document.document) {
                    if (data.document.isEmpty(fieldName)) {
                        data.document.merge(
                            this.configuration.transformer.toYdoc(
                                document.document[fieldName],
                                fieldName,
                            ),
                        );
                    }
                }
            }
        } catch (e) {
            console.error(`Caught error in extension-webhook: ${e}`);
        }
    }

    async onChange(data) {
        if (!this.configuration.events.includes(Events.onChange)) {
            return;
        }

        const save = async () => {
            try {
                await this.sendRequest(Events.onChange, {
                    document: this.configuration.transformer.fromYdoc(data.document),
                    ydoc: Buffer.from(Y.encodeStateAsUpdate(data.document)).toString("base64"),
                    documentName: data.documentName,
                    context: data.context,
                    requestHeaders: data.requestHeaders,
                    requestParameters: Object.fromEntries(
                        data.requestParameters.entries(),
                    ),
                });
            } catch (e) {
                console.error(`Caught error in extension-webhook: ${e}`);
            }
        };

        if (!this.configuration.debounce) {
            return save();
        }

        this.debounce(data.documentName, save);
    }
}

const server = new Server({
    port: 3005,
    extensions: [
        new WebhookWithBin({
            url: "http://localhost:3000/api/ee/document/webhook",
            secret: "459824aaffa928e05f5b1caec411ae5f",
            transformer: TiptapTransformer,
            events: [
                Events.onConnect,
                Events.onCreate,
                Events.onChange,
                Events.onDisconnect,
            ],
            debounce: 2000,
            debounceMaxWait: 10000,
        }),
    ],
});

server.listen();
