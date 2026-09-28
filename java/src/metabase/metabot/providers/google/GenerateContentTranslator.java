package metabase.metabot.providers.google;

import static java.util.Map.entry;


import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;
import metabase.metabot.providers.AiSdkChunk;
import metabase.metabot.providers.AiSdkChunk.ErrorChunk;
import metabase.metabot.providers.AiSdkChunk.Finish;
import metabase.metabot.providers.AiSdkChunk.FinishReason;
import metabase.metabot.providers.AiSdkChunk.ProviderMetadata;
import metabase.metabot.providers.AiSdkChunk.Start;
import metabase.metabot.providers.AiSdkChunk.TokenUsage;
import metabase.metabot.providers.AiSdkChunk.Usage;
import metabase.metabot.providers.ChunkTranslator;
import metabase.metabot.providers.Part;
import metabase.metabot.providers.google.GenerateContentEvent.GeminiPart;
import org.jspecify.annotations.Nullable;

/**
 * Translates one Gemini `streamGenerateContent` stream into AI SDK v5 chunks.
 *
 * <p>Text and thought parts stream into one open block of their kind, and a part of the other kind closes it. A
 * function call arrives whole, so its start, delta and end go out together. A part that emits nothing closes
 * nothing, because a signature can ride a part with empty text mid-stream.
 *
 * <p>Usage is buffered and goes out once at the end, since an event in the middle can carry a partial one.
 */
public final class GenerateContentTranslator implements ChunkTranslator<GenerateContentEvent> {

    /**
     * Covers both Gemini surfaces: every reason Vertex documents, plus four exclusive to the Gemini Developer API,
     * in case we add it or they reach Vertex.
     * https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/GenerateContentResponse#FinishReason
     * https://ai.google.dev/api/generate-content#FinishReason
     */
    private static final Map<String, FinishReason> STOP_REASONS = Map.ofEntries(
        entry("STOP", FinishReason.STOP), // the one reason that means the model said all it had to say
        entry("MAX_TOKENS", FinishReason.LENGTH),
        entry("BLOCKLIST", FinishReason.CONTENT_FILTER),
        entry("ESCALATION", FinishReason.CONTENT_FILTER), // Gemini API only
        entry("IMAGE_PROHIBITED_CONTENT", FinishReason.CONTENT_FILTER),
        entry("IMAGE_RECITATION", FinishReason.CONTENT_FILTER),
        entry("IMAGE_SAFETY", FinishReason.CONTENT_FILTER),
        entry("LANGUAGE", FinishReason.CONTENT_FILTER),
        entry("MODEL_ARMOR", FinishReason.CONTENT_FILTER),
        entry("PROHIBITED_CONTENT", FinishReason.CONTENT_FILTER),
        entry("RECITATION", FinishReason.CONTENT_FILTER),
        entry("SAFETY", FinishReason.CONTENT_FILTER),
        entry("SPII", FinishReason.CONTENT_FILTER),
        entry("IMAGE_OTHER", FinishReason.OTHER),
        entry("NO_IMAGE", FinishReason.OTHER),
        entry("OTHER", FinishReason.OTHER),
        entry("FINISH_REASON_UNSPECIFIED", FinishReason.OTHER),
        entry("MALFORMED_FUNCTION_CALL", FinishReason.ERROR),
        entry("MALFORMED_RESPONSE", FinishReason.ERROR), // Gemini API only
        entry("MISSING_THOUGHT_SIGNATURE", FinishReason.ERROR), // Gemini API only
        entry("TOO_MANY_TOOL_CALLS", FinishReason.ERROR), // Gemini API only
        entry("UNEXPECTED_TOOL_CALL", FinishReason.ERROR));

    private static final TokenUsage NO_USAGE = new TokenUsage(0, 0, 0, 0);

    /**
     * Early stops the client already has a message of its own for: "length" offers to continue the truncated answer,
     * "content-filter" says the response was filtered. Every other early stop needs an error chunk, because nothing
     * downstream would otherwise say what went wrong.
     */
    private static boolean speaksForItself(Finish finish) {
        return switch (finish.reason()) {
            case LENGTH, CONTENT_FILTER -> true;
            default -> false;
        };
    }

    private final Supplier<String> newId;
    /** Metabase's own encoder, so tool arguments encode exactly as the rest of Metabot's JSON does. */
    private final Function<Object, String> encodeJson;
    /** Logs through Metabase's logging, which attributes the line to its owning team and feeds log capture. */
    private final Consumer<String> logEarlyStop;
    private final Consumer<String> malformed;

    private final Part.Slot open = new Part.Slot();
    private @Nullable String messageId;
    private @Nullable String model;
    private @Nullable TokenUsage usage;
    private @Nullable Finish finish;

    public GenerateContentTranslator(Supplier<String> newId,
                                     Function<Object, String> encodeJson,
                                     Consumer<String> logEarlyStop,
                                     Consumer<String> malformed) {
        this.newId = newId;
        this.encodeJson = encodeJson;
        this.logEarlyStop = logEarlyStop;
        this.malformed = malformed;
    }

    @Override
    public GenerateContentEvent parse(Map<?, ?> event) {
        return GenerateContentEvent.parse(event);
    }

    @Override
    public List<AiSdkChunk> step(GenerateContentEvent event) {
        var out = new ArrayList<AiSdkChunk>(2);
        if (event.usage() != null) {
            usage = event.usage();
        }
        // modelVersion can appear on any event; the last one wins
        if (event.modelVersion() != null) {
            model = event.modelVersion();
        }
        if (messageId == null) {
            messageId = event.responseId() != null ? event.responseId() : newId.get();
            out.add(new Start(messageId));
        }
        for (var part : event.parts()) {
            emit(out, part);
        }
        if (event.finishReason() != null) {
            finish = Finish.of(STOP_REASONS, event.finishReason());
            open.close(out);
            if (finish.reason() != FinishReason.STOP) {
                logEarlyStop.accept(finish.raw());
                if (!speaksForItself(finish)) {
                    out.add(new ErrorChunk("Gemini stopped early (" + finish.raw() + ")"));
                }
            }
        }
        if (event.blockReason() != null) {
            open.close(out);
            out.add(new ErrorChunk("Prompt blocked by Google: " + event.blockReason()));
        }
        if (event.errorText() != null) {
            open.close(out);
            out.add(new ErrorChunk(event.errorText()));
        }
        return out;
    }

    private void emit(List<AiSdkChunk> out, GeminiPart part) {
        switch (part) {
            case GeminiPart.FunctionCall call -> {
                String signature = call.thoughtSignature();
                var tool = open.start(out, new Part.Tool(
                    newId.get(), call.name(),
                    signature == null ? null : ProviderMetadata.of("google", "thoughtSignature", signature)));
                out.add(tool.delta(encodeJson.apply(call.args())));
                open.close(out);
            }
            case GeminiPart.Thought(var text) when open.get() instanceof Part.Reasoning block -> out.add(block.delta(text));
            case GeminiPart.Thought(var text) when !text.isEmpty() ->
                out.add(open.start(out, new Part.Reasoning(newId.get())).delta(text));
            case GeminiPart.Text(var text) when open.get() instanceof Part.Text block -> out.add(block.delta(text));
            case GeminiPart.Text(var text) when !text.isEmpty() ->
                out.add(open.start(out, new Part.Text(newId.get())).delta(text));
            case GeminiPart.Malformed(var what) -> malformed.accept(what);
            case GeminiPart.Thought _, GeminiPart.Text _, GeminiPart.Other _ -> {}
        }
    }

    @Override
    public List<AiSdkChunk> finish() {
        var out = new ArrayList<AiSdkChunk>(2);
        open.close(out);
        // An early stop that emits no error chunk still gets usage, so a truncated or filtered turn is never taken
        // for a complete answer. The ones that do emit an error already say what went wrong.
        if (usage == null && finish != null && speaksForItself(finish)) {
            usage = NO_USAGE;
        }
        if (usage != null) {
            out.add(new Usage(messageId, model, usage, finish));
        }
        return out;
    }
}
