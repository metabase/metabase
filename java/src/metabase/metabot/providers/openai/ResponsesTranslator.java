package metabase.metabot.providers.openai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import metabase.metabot.providers.AiSdkChunk;
import metabase.metabot.providers.AiSdkChunk.ErrorChunk;
import metabase.metabot.providers.AiSdkChunk.Finish;
import metabase.metabot.providers.AiSdkChunk.FinishReason;
import metabase.metabot.providers.AiSdkChunk.ProviderMetadata;
import metabase.metabot.providers.AiSdkChunk.Start;
import metabase.metabot.providers.AiSdkChunk.Usage;
import metabase.metabot.providers.ChunkTranslator;
import metabase.metabot.providers.Part;
import metabase.metabot.providers.openai.ResponsesEvent.Created;
import metabase.metabot.providers.openai.ResponsesEvent.Delta;
import metabase.metabot.providers.openai.ResponsesEvent.Failed;
import metabase.metabot.providers.openai.ResponsesEvent.Finished;
import metabase.metabot.providers.openai.ResponsesEvent.Ignored;
import metabase.metabot.providers.openai.ResponsesEvent.Item;
import metabase.metabot.providers.openai.ResponsesEvent.ItemAdded;
import metabase.metabot.providers.openai.ResponsesEvent.ItemDone;
import metabase.metabot.providers.openai.ResponsesEvent.StreamError;
import metabase.metabot.providers.openai.ResponsesEvent.SummaryPartAdded;
import org.jspecify.annotations.Nullable;

/**
 * Translates one OpenAI Responses API stream into AI SDK v5 chunks.
 *
 * <p>The Responses API brackets each output item with `output_item.added` / `output_item.done` and streams
 * deltas in between; AI SDK wants a start/delta/end triple per part. So the only state is which part is open,
 * and at most one is.
 */
public final class ResponsesTranslator implements ChunkTranslator<ResponsesEvent> {

    /** Only an incomplete response carries a reason, so there is nothing here for a normal or tool-call finish. */
    private static final Map<String, FinishReason> STOP_REASONS =
        Map.of("max_output_tokens", FinishReason.LENGTH,
               "content_filter", FinishReason.CONTENT_FILTER);

    private final Supplier<String> newId;
    /** User-facing, so it comes from the caller: it has to be rendered in their locale by Metabase's i18n. */
    private final Supplier<String> failedWithoutMessage;

    private final Part.Slot open = new Part.Slot();
    private @Nullable String model;

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
                open.close(out);
                switch (item) {
                    case Item.Message() -> open.start(out, new Part.Text(newId.get()));
                    // a reasoning item always has an id; should one not, it still gets one, as every other part does
                    case Item.Reasoning(var id, _) -> open.start(out, new Part.Reasoning(id != null ? id : newId.get()));
                    case Item.FunctionCall(var callId, var name) -> open.start(out, new Part.Tool(callId, name));
                    case Item.Unsupported() -> {}
                }
            }
            case ItemDone(var item) -> {
                // a finished reasoning item carries the encrypted content that lets us replay it next
                // round-trip; it rides out on the reasoning-end
                if (item instanceof Item.Reasoning(var id, var content)
                        && content != null
                        && open.get() instanceof Part.Reasoning(var openId, _)
                        && openId.equals(id)) {
                    open.update(new Part.Reasoning(openId, ProviderMetadata.of(
                        "openai", "itemId", openId, "encryptedContent", content)));
                }
                open.close(out);
            }
            case Delta(var delta) -> {
                var part = open.get();
                if (part != null) {
                    out.add(part.delta(delta));
                }
            }
            case SummaryPartAdded(long index) -> {
                if (index > 0 && open.get() instanceof Part.Reasoning reasoning) {
                    out.add(reasoning.delta("\n\n"));
                }
            }
            case Finished(var responseId, var usage, var incompleteReason) ->
                out.add(new Usage(responseId, model, usage, Finish.ofNullable(STOP_REASONS, incompleteReason)));
            case Failed(var message, var code) -> out.add(new ErrorChunk(
                message != null ? message : code != null ? code : failedWithoutMessage.get()));
            case StreamError(var message) -> out.add(new ErrorChunk(message));
            case Ignored() -> {}
        }
        return out;
    }

    @Override
    public List<AiSdkChunk> finish() {
        var out = new ArrayList<AiSdkChunk>(1);
        open.close(out);
        return out;
    }
}
