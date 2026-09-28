package metabase.metabot.providers.openai;

import static metabase.metabot.providers.Clj.map;
import static metabase.metabot.providers.Clj.num;
import static metabase.metabot.providers.Clj.str;

import java.util.Map;
import metabase.metabot.providers.AiSdkChunk.TokenUsage;

/**
 * The OpenAI Responses API streaming events the translator acts on
 * (https://platform.openai.com/docs/api-reference/responses-streaming). Everything else parses to {@link Ignored}.
 */
public sealed interface ResponsesEvent {

    record Created(String responseId, String model) implements ResponsesEvent {}

    record ItemAdded(Item item) implements ResponsesEvent {}

    record ItemDone(Item item) implements ResponsesEvent {}

    /** Any `*.delta`: output text, reasoning summary text, or function-call arguments. It extends the open item. */
    record Delta(String delta) implements ResponsesEvent {}

    /** A reasoning item's summary is split into parts; every one after the first is a new paragraph. */
    record SummaryPartAdded(long summaryIndex) implements ResponsesEvent {}

    /** `response.completed` or `response.incomplete`. The latter still has valid partial output. */
    record Finished(String responseId, TokenUsage usage, String incompleteReason) implements ResponsesEvent {}

    /** `response.failed`: the error lives nested under `response.error`. */
    record Failed(String message, String code) implements ResponsesEvent {}

    /** A top-level `error` event. */
    record StreamError(String message) implements ResponsesEvent {}

    record Ignored() implements ResponsesEvent {}

    sealed interface Item {
        record Message() implements Item {}
        record FunctionCall(String callId, String name) implements Item {}
        record Reasoning(String id, String encryptedContent) implements Item {}
        /** Built-in tool calls and the like, which we do not translate. */
        record Unsupported() implements Item {}
    }

    static ResponsesEvent parse(Map<?, ?> event) {
        String type = str(event, "type");
        return switch (type == null ? "" : type) {
            case "response.created" -> {
                Map<?, ?> response = map(event, "response");
                yield new Created(str(response, "id"), str(response, "model"));
            }
            case "response.output_item.added" -> new ItemAdded(parseItem(map(event, "item")));
            case "response.output_item.done" -> new ItemDone(parseItem(map(event, "item")));
            case "response.reasoning_summary_part.added" -> new SummaryPartAdded(num(event, "summary_index"));
            case "response.completed", "response.incomplete" -> {
                Map<?, ?> response = map(event, "response");
                yield new Finished(str(response, "id"),
                                   parseUsage(map(response, "usage")),
                                   str(map(response, "incomplete_details"), "reason"));
            }
            case "response.failed" -> {
                Map<?, ?> error = map(map(event, "response"), "error");
                yield new Failed(str(error, "message"), str(error, "code"));
            }
            case "error" -> {
                String nested = str(map(event, "error"), "message");
                yield new StreamError(nested != null ? nested : str(event, "message"));
            }
            default -> {
                String delta = str(event, "delta");
                yield delta != null ? new Delta(delta) : new Ignored();
            }
        };
    }

    private static Item parseItem(Map<?, ?> item) {
        String type = str(item, "type");
        return switch (type == null ? "" : type) {
            case "message" -> new Item.Message();
            case "function_call" -> new Item.FunctionCall(str(item, "call_id"), str(item, "name"));
            case "reasoning" -> new Item.Reasoning(str(item, "id"), str(item, "encrypted_content"));
            default -> new Item.Unsupported();
        };
    }

    /**
     * OpenAI reports cached tokens as a subset of `input_tokens`. `cache_write_tokens` is undocumented but present in
     * live responses, and should always be 0.
     */
    private static TokenUsage parseUsage(Map<?, ?> usage) {
        Map<?, ?> inputDetails = map(usage, "input_tokens_details");
        return new TokenUsage(num(usage, "input_tokens"),
                              num(usage, "output_tokens"),
                              num(inputDetails, "cache_write_tokens"),
                              num(inputDetails, "cached_tokens"));
    }
}
