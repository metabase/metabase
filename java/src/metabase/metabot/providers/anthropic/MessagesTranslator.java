package metabase.metabot.providers.anthropic;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import metabase.metabot.providers.AiSdkChunk;
import metabase.metabot.providers.AiSdkChunk.*;
import metabase.metabot.providers.ChunkTranslator;
import metabase.metabot.providers.Part;
import metabase.metabot.providers.anthropic.MessagesEvent.*;

/**
 * Translates one Anthropic Messages API stream into AI SDK v5 chunks.
 *
 * <p>Anthropic brackets each content block with `content_block_start` / `content_block_stop`, and at most one is
 * open. Usage and the stop reason arrive in `message_delta` and are held to the end of the stream: that way an
 * interrupted stream still reports the last usage it saw.
 */
public final class MessagesTranslator implements ChunkTranslator<MessagesEvent> {

    private static final Map<String, FinishReason> STOP_REASONS = Map.of(
        "end_turn", FinishReason.STOP,
        "stop_sequence", FinishReason.STOP,
        "pause_turn", FinishReason.STOP,
        "max_tokens", FinishReason.LENGTH,
        "model_context_window_exceeded", FinishReason.LENGTH,
        "tool_use", FinishReason.TOOL_CALLS,
        "refusal", FinishReason.CONTENT_FILTER);

    private final Supplier<String> newId;

    private final Part.Slot open = new Part.Slot();
    private String messageId;
    private String model;
    private TokenUsage lastUsage;
    private String stopReason;

    public MessagesTranslator(Supplier<String> newId) {
        this.newId = newId;
    }

    @Override
    public MessagesEvent parse(Map<?, ?> event) {
        return MessagesEvent.parse(event);
    }

    @Override
    public List<AiSdkChunk> step(MessagesEvent event) {
        var out = new ArrayList<AiSdkChunk>(1);
        switch (event) {
            case MessageStart(var id, var m, var usage) -> {
                messageId = id;
                model = m;
                lastUsage = usage;
                out.add(new Start(id));
            }
            case BlockStart(var blockId, var index, var block) -> {
                // Anthropic stops every block before starting the next; a stray one is closed rather than lost
                open.close(out);
                String id = blockId != null ? blockId : index != null ? index.toString() : newId.get();
                switch (block) {
                    case Block.Text() -> open.start(out, new Part.Text(id));
                    case Block.ToolUse(var name) -> open.start(out, new Part.Tool(id, name));
                    case Block.Thinking() -> open.start(out, new Part.Reasoning(id));
                    // opaque to us, and streams no deltas; the data has to be echoed back verbatim
                    case Block.RedactedThinking(var data) ->
                        open.start(out, new Part.Reasoning(id, ProviderMetadata.of("anthropic", "redactedData", data)));
                    case Block.Unsupported() -> {}
                }
            }
            case BlockDelta(var delta) -> {
                switch (delta) {
                    case Delta.Text(var text) when open.get() instanceof Part.Text part -> out.add(part.delta(text));
                    case Delta.Thinking(var text) when open.get() instanceof Part.Reasoning part ->
                        out.add(part.delta(text));
                    case Delta.InputJson(var json) when open.get() instanceof Part.Tool part -> out.add(part.delta(json));
                    // the signature rides the reasoning-end; nothing is emitted to the client
                    case Delta.Signature(var piece) when open.get() instanceof Part.Reasoning(var id, var metadata) ->
                        open.update(new Part.Reasoning(id, withSignaturePiece(metadata, piece)));
                    // a delta that does not belong to the open block, or no block at all
                    default -> {}
                }
            }
            case BlockStop() -> open.close(out);
            case MessageDelta(var usage, var reason) -> {
                lastUsage = usage;
                stopReason = reason;
            }
            case StreamError(var message) -> out.add(new AiSdkChunk.Error(message));
            case Ignored() -> {}
        }
        return out;
    }

    @Override
    public List<AiSdkChunk> finish() {
        var out = new ArrayList<AiSdkChunk>(2);
        open.close(out);
        if (lastUsage != null) {
            out.add(new AiSdkChunk.Usage(messageId, model, lastUsage, Finish.of(STOP_REASONS, stopReason)));
        }
        return out;
    }

    /** A signature arrives in pieces, which concatenate into the one a thinking block is replayed with. */
    private static ProviderMetadata withSignaturePiece(ProviderMetadata metadata, String piece) {
        String prior = metadata == null ? null : metadata.fields().get("signature");
        String signature = (prior == null ? "" : prior) + (piece == null ? "" : piece);
        return metadata == null
            ? ProviderMetadata.of("anthropic", "signature", signature)
            : metadata.with("signature", signature);
    }
}
