package metabase.metabot.providers.google;

import static metabase.metabot.providers.Clj.get;
import static metabase.metabot.providers.Clj.firstMap;
import static metabase.metabot.providers.Clj.map;
import static metabase.metabot.providers.Clj.num;
import static metabase.metabot.providers.Clj.str;
import static metabase.metabot.providers.Clj.truthy;

import clojure.lang.RT;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import metabase.metabot.providers.AiSdkChunk.TokenUsage;
import org.jspecify.annotations.Nullable;

/**
 * One `streamGenerateContent` SSE event, a `GenerateContentResponse`, reduced to its first candidate.
 *
 * <p>Unlike Anthropic's or the Responses API's, the stream has no events that open or close a part: an event carries
 * whole parts, and text and thoughts stream as consecutive parts of the same kind.
 *
 * @param usage       null when the event carries no `usageMetadata`; an event in the middle may carry a partial one
 * @param blockReason set when Google blocked the prompt, which ends the stream with no candidates
 * @param errorText   set when the stream carries an error envelope, e.g. for a failure mid-stream
 */
public record GenerateContentEvent(@Nullable String responseId,
                                   @Nullable String modelVersion,
                                   List<GeminiPart> parts,
                                   @Nullable String finishReason,
                                   @Nullable String blockReason,
                                   @Nullable String errorText,
                                   @Nullable TokenUsage usage) {

    public sealed interface GeminiPart {
        /**
         * Arrives with complete `args`, which stay Clojure data until they are encoded. `thoughtSignature`, which
         * Gemini 3.x adds, must go back to Google when the call is replayed.
         */
        record FunctionCall(@Nullable String name, @Nullable Object args, @Nullable String thoughtSignature) implements GeminiPart {}
        /** A thought summary; `text` may be empty. */
        record Thought(String text) implements GeminiPart {}
        /** `text` may be empty. A `thoughtSignature` here is optional to replay, so it is dropped. */
        record Text(String text) implements GeminiPart {}
        /** Anything else, including a thought with no text, which emits nothing. */
        record Other() implements GeminiPart {}
    }

    public static GenerateContentEvent parse(Map<?, ?> event) {
        Map<?, ?> candidate = firstMap(event, "candidates");
        return new GenerateContentEvent(str(event, "responseId"),
                                        str(event, "modelVersion"),
                                        parseParts(map(candidate, "content")),
                                        str(candidate, "finishReason"),
                                        str(map(event, "promptFeedback"), "blockReason"),
                                        errorText(get(event, "error")),
                                        parseUsage(map(event, "usageMetadata")));
    }

    private static List<GeminiPart> parseParts(@Nullable Map<?, ?> content) {
        var parts = new ArrayList<GeminiPart>();
        if (get(content, "parts") instanceof List<?> raw) {
            for (Object p : raw) {
                if (p instanceof Map<?, ?> part) {
                    parts.add(parsePart(part));
                }
            }
        }
        return parts;
    }

    private static GeminiPart parsePart(Map<?, ?> part) {
        Map<?, ?> call = map(part, "functionCall");
        if (call != null) {
            return new GeminiPart.FunctionCall(str(call, "name"), get(call, "args"), str(part, "thoughtSignature"));
        }
        String text = str(part, "text");
        if (text == null) {
            return new GeminiPart.Other();
        }
        return truthy(part, "thought") ? new GeminiPart.Thought(text) : new GeminiPart.Text(text);
    }

    private static @Nullable String errorText(@Nullable Object error) {
        if (error == null) {
            return null;
        }
        String message = error instanceof Map<?, ?> m ? str(m, "message") : null;
        return message != null ? message : RT.printString(error);
    }

    /**
     * `promptTokenCount` is the total input and `cachedContentTokenCount` a part of it, as with OpenAI.
     * `toolUsePromptTokenCount` counts the results of Google's server-side tools fed back as input, a bucket of its own,
     * so it is summed in. Thinking output, `thoughtsTokenCount`, is billed as output. Implicit caching has no
     * cache-write count.
     */
    private static @Nullable TokenUsage parseUsage(@Nullable Map<?, ?> usage) {
        if (usage == null) {
            return null;
        }
        return new TokenUsage(num(usage, "promptTokenCount") + num(usage, "toolUsePromptTokenCount"),
                              num(usage, "candidatesTokenCount") + num(usage, "thoughtsTokenCount"),
                              0,
                              num(usage, "cachedContentTokenCount"));
    }
}
