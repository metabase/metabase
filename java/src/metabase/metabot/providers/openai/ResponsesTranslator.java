package metabase.metabot.providers.openai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import metabase.metabot.providers.AiSdkChunk;
import metabase.metabot.providers.AiSdkChunk.*;
import metabase.metabot.providers.ChunkTranslator;
import metabase.metabot.providers.openai.ResponsesEvent.*;

/**
 * Translates one OpenAI Responses API stream into AI SDK v5 chunks.
 *
 * <p>The Responses API brackets each output item with `output_item.added` / `output_item.done` and streams
 * deltas in between; AI SDK wants a start/delta/end triple per part. So the only state is which part is open,
 * and at most one is.
 */
public final class ResponsesTranslator implements ChunkTranslator<ResponsesEvent> {

    /** The part currently streaming. */
    private sealed interface Open {
        AiSdkChunk start();
        AiSdkChunk delta(String delta);
        AiSdkChunk end();

        record Text(String id) implements Open {
            public AiSdkChunk start() { return new TextStart(id); }
            public AiSdkChunk delta(String d) { return new TextDelta(id, d); }
            public AiSdkChunk end() { return new TextEnd(id); }
        }

        record Reasoning(String id) implements Open {
            public AiSdkChunk start() { return new ReasoningStart(id); }
            public AiSdkChunk delta(String d) { return new ReasoningDelta(id, d); }
            public AiSdkChunk end() { return new ReasoningEnd(id, null); }
        }

        record Tool(String callId, String name) implements Open {
            public AiSdkChunk start() { return new ToolInputStart(callId, name); }
            public AiSdkChunk delta(String d) { return new ToolInputDelta(callId, d); }
            public AiSdkChunk end() { return new ToolInputAvailable(callId, name); }
        }
    }

    /** Only an incomplete response carries a reason, so there is nothing here for a normal or tool-call finish. */
    private static final Map<String, FinishReason> STOP_REASONS =
        Map.of("max_output_tokens", FinishReason.LENGTH,
               "content_filter", FinishReason.CONTENT_FILTER);

    private final Supplier<String> newId;
    /** User-facing, so it comes from the caller: it has to be rendered in their locale by Metabase's i18n. */
    private final Supplier<String> failedWithoutMessage;

    private Open open;
    private String model;

    public ResponsesTranslator(Supplier<String> newId, Supplier<String> failedWithoutMessage) {
        this.newId = newId;
        this.failedWithoutMessage = failedWithoutMessage;
    }

    @Override
    public ResponsesEvent parse(Map<?, ?> event) {
        return ResponsesEvent.parse(event);
    }

    @Override
    public List<AiSdkChunk> step(ResponsesEvent event) {
        var out = new ArrayList<AiSdkChunk>(2);
        switch (event) {
            case Created(var responseId, var m) -> {
                model = m;
                out.add(new Start(responseId));
            }
            case ItemAdded(var item) -> {
                close(out);
                open = switch (item) {
                    case Item.Message() -> new Open.Text(newId.get());
                    case Item.Reasoning(var id, var ignored) -> new Open.Reasoning(id);
                    case Item.FunctionCall(var callId, var name) -> new Open.Tool(callId, name);
                    case Item.Unsupported() -> null;
                };
                if (open != null) {
                    out.add(open.start());
                }
            }
            case ItemDone(var item) -> {
                // a finished reasoning item carries the encrypted content that lets us replay it next
                // round-trip; it rides out on the reasoning-end
                if (item instanceof Item.Reasoning(var id, var content)
                        && content != null
                        && open instanceof Open.Reasoning(var openId)
                        && openId.equals(id)) {
                    out.add(new ReasoningEnd(id, new ProviderMetadata(
                        "openai", Map.of("itemId", id, "encryptedContent", content))));
                    open = null;
                }
                close(out);
            }
            case Delta(var delta) -> {
                if (open != null) {
                    out.add(open.delta(delta));
                }
            }
            case SummaryPartAdded(var index) -> {
                if (index > 0 && open instanceof Open.Reasoning reasoning) {
                    out.add(reasoning.delta("\n\n"));
                }
            }
            case Finished(var responseId, var usage, var incompleteReason) ->
                out.add(new AiSdkChunk.Usage(responseId, model, usage, Finish.of(STOP_REASONS, incompleteReason)));
            case Failed(var message, var code) -> out.add(new AiSdkChunk.Error(
                message != null ? message : code != null ? code : failedWithoutMessage.get()));
            case StreamError(var message) -> out.add(new AiSdkChunk.Error(message));
            case Ignored() -> {}
        }
        return out;
    }

    @Override
    public List<AiSdkChunk> finish() {
        var out = new ArrayList<AiSdkChunk>(1);
        close(out);
        return out;
    }

    private void close(List<AiSdkChunk> out) {
        if (open != null) {
            out.add(open.end());
            open = null;
        }
    }
}
