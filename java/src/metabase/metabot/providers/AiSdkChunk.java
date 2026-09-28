package metabase.metabot.providers;

import static metabase.metabot.providers.Clj.kw;
import static metabase.metabot.providers.Clj.mapOf;

import clojure.lang.IPersistentMap;
import clojure.lang.Keyword;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The AI SDK v5 stream chunks a provider adapter emits (https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol),
 * restricted to the ones Metabot's adapters produce. {@link #toClj} renders the wire shape the Clojure side
 * consumes; the exhaustive switch there is what makes adding a chunk a compile error until it is rendered.
 */
public sealed interface AiSdkChunk {

    record Start(String messageId) implements AiSdkChunk {}

    record TextStart(String id) implements AiSdkChunk {}
    record TextDelta(String id, String delta) implements AiSdkChunk {}
    record TextEnd(String id) implements AiSdkChunk {}

    record ReasoningStart(String id) implements AiSdkChunk {}
    record ReasoningDelta(String id, String delta) implements AiSdkChunk {}
    /** `metadata` is what the provider needs to see again next round-trip, when it sent any. */
    record ReasoningEnd(String id, ProviderMetadata metadata) implements AiSdkChunk {}

    /** `metadata` is what the provider needs to see again when this call is replayed, when it sent any. */
    record ToolInputStart(String toolCallId, String toolName, ProviderMetadata metadata) implements AiSdkChunk {}
    record ToolInputDelta(String toolCallId, String inputTextDelta) implements AiSdkChunk {}
    record ToolInputAvailable(String toolCallId, String toolName) implements AiSdkChunk {}

    /** Non-standard: AI SDK v5 has no usage chunk. `finish` is null for a response that completed normally. */
    record Usage(String responseId, String model, TokenUsage usage, Finish finish) implements AiSdkChunk {}

    record Error(String errorText) implements AiSdkChunk {}

    /** Vendor data carried verbatim on a part, rendered as `{:<provider> {...fields}}`. */
    record ProviderMetadata(String provider, Map<String, String> fields) {
        /** From alternating `"field", value` pairs. Nil values are kept, as they would be in a Clojure literal. */
        public static ProviderMetadata of(String provider, String... kvs) {
            var fields = new LinkedHashMap<String, String>();
            for (int i = 0; i < kvs.length; i += 2) {
                fields.put(kvs[i], kvs[i + 1]);
            }
            return new ProviderMetadata(provider, fields);
        }

        /** A copy with `field` set to `value`. */
        public ProviderMetadata with(String field, String value) {
            var updated = new LinkedHashMap<>(fields);
            updated.put(field, value);
            return new ProviderMetadata(provider, updated);
        }

        /** From Clojure's `{:<provider> {:<field> "value"}}`, as a dialect's Clojure pre-transform mints it. */
        public static ProviderMetadata fromClj(Map<?, ?> m) {
            if (m.size() != 1) {
                throw new IllegalArgumentException("provider metadata names exactly one provider: " + m);
            }
            var entry = m.entrySet().iterator().next();
            return fromClj(entry.getKey(), entry.getValue());
        }

        /** One provider's entry of a Clojure `{:<provider> {:<field> "value"}}`. */
        public static ProviderMetadata fromClj(Object provider, Object cljFields) {
            var fields = new LinkedHashMap<String, String>();
            if (cljFields instanceof Map<?, ?> m) {
                for (var field : m.entrySet()) {
                    fields.put(((Keyword) field.getKey()).getName(), (String) field.getValue());
                }
            }
            return new ProviderMetadata(((Keyword) provider).getName(), fields);
        }

        IPersistentMap toClj() {
            IPersistentMap rendered = mapOf();
            for (var field : fields.entrySet()) {
                rendered = rendered.assoc(kw(field.getKey()), field.getValue());
            }
            return mapOf(provider, rendered);
        }
    }

    record TokenUsage(long promptTokens, long completionTokens, long cacheCreationTokens, long cacheReadTokens) {
        IPersistentMap toClj() {
            return mapOf("promptTokens", promptTokens,
                         "completionTokens", completionTokens,
                         "cacheCreationTokens", cacheCreationTokens,
                         "cacheReadTokens", cacheReadTokens);
        }
    }

    record Finish(FinishReason reason, String raw) {
        /**
         * A provider stop reason through that provider's `table`; unmapped reasons are {@link FinishReason#OTHER},
         * and no reason is no finish.
         */
        public static Finish of(Map<String, FinishReason> table, String raw) {
            return raw == null ? null : new Finish(table.getOrDefault(raw, FinishReason.OTHER), raw);
        }
    }

    /** AI SDK v5 `FinishReason`. */
    enum FinishReason {
        STOP("stop"), LENGTH("length"), CONTENT_FILTER("content-filter"), TOOL_CALLS("tool-calls"),
        ERROR("error"), OTHER("other");

        private final String wire;

        FinishReason(String wire) {
            this.wire = wire;
        }

        public static FinishReason fromWire(String wire) {
            for (var reason : values()) {
                if (reason.wire.equals(wire)) {
                    return reason;
                }
            }
            throw new IllegalArgumentException("not an AI SDK finish reason: " + wire);
        }

        /**
         * A provider's stop-reason table as Clojure keeps it, `{"raw" "ai-sdk-reason"}`. Validated here, so a table
         * naming a reason AI SDK does not have fails when the translator is built rather than on the wire.
         */
        public static Map<String, FinishReason> table(Map<?, ?> cljTable) {
            return cljTable.entrySet().stream().collect(Collectors.toUnmodifiableMap(
                e -> (String) e.getKey(), e -> fromWire((String) e.getValue())));
        }

        public String wire() {
            return wire;
        }
    }

    static IPersistentMap toClj(AiSdkChunk chunk) {
        return switch (chunk) {
            case Start(var messageId) -> mapOf("type", kw("start"), "messageId", messageId);
            case TextStart(var id) -> mapOf("type", kw("text-start"), "id", id);
            case TextDelta(var id, var delta) -> mapOf("type", kw("text-delta"), "id", id, "delta", delta);
            case TextEnd(var id) -> mapOf("type", kw("text-end"), "id", id);
            case ReasoningStart(var id) -> mapOf("type", kw("reasoning-start"), "id", id);
            case ReasoningDelta(var id, var delta) -> mapOf("type", kw("reasoning-delta"), "id", id, "delta", delta);
            case ReasoningEnd(var id, var metadata) -> withMetadata(mapOf("type", kw("reasoning-end"), "id", id), metadata);
            case ToolInputStart(var callId, var name, var metadata) ->
                withMetadata(mapOf("type", kw("tool-input-start"), "toolCallId", callId, "toolName", name), metadata);
            case ToolInputDelta(var callId, var delta) ->
                mapOf("type", kw("tool-input-delta"), "toolCallId", callId, "inputTextDelta", delta);
            case ToolInputAvailable(var callId, var name) ->
                mapOf("type", kw("tool-input-available"), "toolCallId", callId, "toolName", name);
            case Usage(var responseId, var model, var usage, var finish) -> {
                IPersistentMap m = mapOf("type", kw("usage"), "usage", usage.toClj(), "id", responseId, "model", model);
                yield finish == null ? m : m.assoc(kw("finish-reason"), finish.reason().wire)
                                            .assoc(kw("raw-finish-reason"), finish.raw());
            }
            case Error(var text) -> mapOf("type", kw("error"), "errorText", text);
        };
    }

    private static IPersistentMap withMetadata(IPersistentMap chunk, ProviderMetadata metadata) {
        return metadata == null ? chunk : chunk.assoc(kw("providerMetadata"), metadata.toClj());
    }
}
