package metabase.metabot.providers.anthropic;

import static metabase.metabot.providers.Clj.map;
import static metabase.metabot.providers.Clj.num;
import static metabase.metabot.providers.Clj.optNum;
import static metabase.metabot.providers.Clj.str;
import static metabase.metabot.providers.Clj.type;

import java.util.Map;
import metabase.metabot.providers.AiSdkChunk.TokenUsage;

/**
 * The Anthropic Messages API streaming events the translator acts on
 * (https://platform.claude.com/docs/en/build-with-claude/streaming#event-types). Everything else — `ping`,
 * `message_stop` — parses to {@link Ignored}.
 */
public sealed interface MessagesEvent {

    /** `usage` is null when the event carries none. */
    record MessageStart(String messageId, String model, TokenUsage usage) implements MessagesEvent {}

    /** `id` is the block's own id where it has one (tool use); `index` is its position in the message. */
    record BlockStart(String id, Long index, Block block) implements MessagesEvent {}

    record BlockDelta(Delta delta) implements MessagesEvent {}

    record BlockStop() implements MessagesEvent {}

    /** Usage here is cumulative, including what `message_start` reported. Both fields may be null. */
    record MessageDelta(TokenUsage usage, String stopReason) implements MessagesEvent {}

    record StreamError(String message) implements MessagesEvent {}

    record Ignored() implements MessagesEvent {}

    sealed interface Block {
        record Text() implements Block {}
        record ToolUse(String name) implements Block {}
        record Thinking() implements Block {}
        /** Opaque to us, and streams no deltas; `data` has to be echoed back verbatim. */
        record RedactedThinking(String data) implements Block {}
        /** Server tool use and the like, which we do not translate. */
        record Unsupported() implements Block {}
    }

    sealed interface Delta {
        record Text(String text) implements Delta {}
        record Thinking(String thinking) implements Delta {}
        record InputJson(String partialJson) implements Delta {}
        /** Arrives in pieces, which concatenate into the signature a thinking block is replayed with. */
        record Signature(String signature) implements Delta {}
        record Unsupported() implements Delta {}
    }

    static MessagesEvent parse(Map<?, ?> event) {
        return switch (type(event)) {
            case "message_start" -> {
                Map<?, ?> message = map(event, "message");
                yield new MessageStart(str(message, "id"), str(message, "model"), parseUsage(map(message, "usage")));
            }
            case "content_block_start" -> {
                Map<?, ?> block = map(event, "content_block");
                yield new BlockStart(str(block, "id"), optNum(event, "index"), parseBlock(block));
            }
            case "content_block_delta" -> new BlockDelta(parseDelta(map(event, "delta")));
            case "content_block_stop" -> new BlockStop();
            case "message_delta" -> new MessageDelta(parseUsage(map(event, "usage")),
                                                     str(map(event, "delta"), "stop_reason"));
            case "error" -> new StreamError(str(map(event, "error"), "message"));
            default -> new Ignored();
        };
    }

    private static Block parseBlock(Map<?, ?> block) {
        return switch (type(block)) {
            case "text" -> new Block.Text();
            case "tool_use" -> new Block.ToolUse(str(block, "name"));
            case "thinking" -> new Block.Thinking();
            case "redacted_thinking" -> new Block.RedactedThinking(str(block, "data"));
            default -> new Block.Unsupported();
        };
    }

    private static Delta parseDelta(Map<?, ?> delta) {
        return switch (type(delta)) {
            case "text_delta" -> new Delta.Text(str(delta, "text"));
            case "thinking_delta" -> new Delta.Thinking(str(delta, "thinking"));
            case "input_json_delta" -> new Delta.InputJson(str(delta, "partial_json"));
            case "signature_delta" -> new Delta.Signature(str(delta, "signature"));
            default -> new Delta.Unsupported();
        };
    }

    /**
     * Anthropic reports three disjoint input buckets — fresh, written to the cache, and read from it — and the
     * total input sent to the model is their sum. We pre-sum them into `promptTokens`, so downstream analytics and
     * `ai_usage_log` see a provider-neutral total, matching OpenAI's `input_tokens` (where the cache counts are a
     * subset of the total). Without prompt caching both cache buckets are 0 and the sum is just `input_tokens`.
     */
    private static TokenUsage parseUsage(Map<?, ?> usage) {
        if (usage == null) {
            return null;
        }
        long cacheCreation = num(usage, "cache_creation_input_tokens");
        long cacheRead = num(usage, "cache_read_input_tokens");
        return new TokenUsage(num(usage, "input_tokens") + cacheCreation + cacheRead,
                              num(usage, "output_tokens"),
                              cacheCreation,
                              cacheRead);
    }
}
