package metabase.metabot.providers.chat;

import static metabase.metabot.providers.Clj.firstMap;
import static metabase.metabot.providers.Clj.map;
import static metabase.metabot.providers.Clj.num;
import static metabase.metabot.providers.Clj.str;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import metabase.metabot.providers.AiSdkChunk.ProviderMetadata;
import metabase.metabot.providers.AiSdkChunk.TokenUsage;
import org.jspecify.annotations.Nullable;

/**
 * One OpenAI-compatible Chat Completions streaming chunk (`chat.completion.chunk`), reduced to its first choice.
 *
 * <p>Unlike Anthropic's or the Responses API's, this stream has no events that open or close a part: what a chunk
 * carries has to be classified from the shape of its delta, which is what {@link Content} is.
 *
 * @param reasoningMetadata not a wire field: a dialect's own pre-transform in Clojure may mint it, already
 *                          namespaced by provider (today only Mistral's, for a think chunk's signature)
 */
public record ChatChunk(@Nullable String id,
                        @Nullable String model,
                        Content content,
                        @Nullable ProviderMetadata reasoningMetadata,
                        @Nullable String finishReason,
                        @Nullable TokenUsage usage) {

    /**
     * What a delta carries, by precedence: text, then a tool call, then reasoning. Tool calls outrank reasoning
     * because a tool call's opening delta is the only one carrying its id and name, while a reasoning fragment is
     * display text. Empty text, common between tool calls, is no text at all.
     */
    public sealed interface Content {
        record Text(String text) implements Content {}
        /** The opening delta of a tool call. Parallel calls are told apart by `id`, never by `index`. */
        record ToolCallStart(String id, String name, String arguments) implements Content {}
        /** An opening delta missing what it needs, so not a call that can be started; `what` says which. */
        record ToolCallMalformed(String what) implements Content {}
        /** A later delta of the open tool call; `arguments` may be absent. */
        record ToolCallArguments(@Nullable String arguments) implements Content {}
        record Reasoning(String text) implements Content {}
        record None() implements Content {}
    }

    public static ChatChunk parse(Map<?, ?> chunk) {
        Map<?, ?> choice = firstMap(chunk, "choices");
        Map<?, ?> delta = map(choice, "delta");
        Map<?, ?> reasoningMetadata = map(delta, "reasoning_metadata");
        return new ChatChunk(str(chunk, "id"),
                             str(chunk, "model"),
                             parseContent(delta),
                             reasoningMetadata == null ? null : ProviderMetadata.fromClj(reasoningMetadata),
                             str(choice, "finish_reason"),
                             parseUsage(map(chunk, "usage")));
    }

    private static Content parseContent(@Nullable Map<?, ?> delta) {
        String text = str(delta, "content");
        if (text != null && !text.isEmpty()) {
            return new Content.Text(text);
        }
        Map<?, ?> toolCall = firstMap(delta, "tool_calls");
        if (toolCall != null) {
            Map<?, ?> function = map(toolCall, "function");
            String id = str(toolCall, "id");
            String arguments = str(function, "arguments");
            if (id == null) {
                return new Content.ToolCallArguments(arguments);
            }
            String name = str(function, "name");
            return name != null
                ? new Content.ToolCallStart(id, name, Objects.requireNonNullElse(arguments, ""))
                : new Content.ToolCallMalformed("tool call without a name");
        }
        String reasoning = reasoning(delta);
        return reasoning != null ? new Content.Reasoning(reasoning) : new Content.None();
    }

    /**
     * Reasoning under either spelling. vLLM 0.26 emits `reasoning` and treats `reasoning_content` as its deprecated
     * name; older builds, Z.AI, and other compatible servers still emit the latter, and a self-hosted server's
     * version is the customer's choice.
     */
    private static @Nullable String reasoning(@Nullable Map<?, ?> delta) {
        for (String key : List.of("reasoning", "reasoning_content")) {
            String r = str(delta, key);
            if (r != null && !r.isEmpty()) {
                return r;
            }
        }
        return null;
    }

    /**
     * `prompt_tokens` is the total input; the cache buckets under `prompt_tokens_details` are a subset of it.
     * `cache_write_tokens` is undocumented but reported by OpenRouter (Anthropic models) and newer OpenAI models;
     * providers without it (e.g. Z.AI) omit it.
     */
    private static @Nullable TokenUsage parseUsage(@Nullable Map<?, ?> usage) {
        if (usage == null) {
            return null;
        }
        Map<?, ?> details = map(usage, "prompt_tokens_details");
        return new TokenUsage(num(usage, "prompt_tokens"),
                              num(usage, "completion_tokens"),
                              num(details, "cache_write_tokens"),
                              num(details, "cached_tokens"));
    }
}
