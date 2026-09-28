package metabase.metabot.providers.anthropic;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import metabase.metabot.providers.AiSdkChunk;
import metabase.metabot.providers.AiSdkChunk.*;
import metabase.metabot.providers.ChunkTranslator;
import metabase.metabot.providers.anthropic.MessagesEvent.*;

/**
 * Translates one Anthropic Messages API stream into AI SDK v5 chunks.
 *
 * <p>Anthropic brackets each content block with `content_block_start` / `content_block_stop`, and at most one is
 * open. Usage and the stop reason arrive in `message_delta` and are held to the end of the stream: that way an
 * interrupted stream still reports the last usage it saw.
 */
public final class MessagesTranslator implements ChunkTranslator<MessagesEvent> {

    /** The content block currently streaming. */
    private sealed interface Open {
        AiSdkChunk start();
        AiSdkChunk end();

        record Text(String id) implements Open {
            public AiSdkChunk start() { return new TextStart(id); }
            public AiSdkChunk end() { return new TextEnd(id); }
        }

        record Tool(String id, String name) implements Open {
            public AiSdkChunk start() { return new ToolInputStart(id, name); }
            public AiSdkChunk end() { return new ToolInputAvailable(id, name); }
        }

        /** `signature` is null until the first signature delta; a signed block is what Anthropic lets us replay. */
        record Thinking(String id, String signature) implements Open {
            public AiSdkChunk start() { return new ReasoningStart(id); }
            public AiSdkChunk end() {
                return new ReasoningEnd(id, signature == null ? null : ProviderMetadata.of("anthropic", "signature", signature));
            }
        }

        record Redacted(String id, String data) implements Open {
            public AiSdkChunk start() { return new ReasoningStart(id); }
            public AiSdkChunk end() { return new ReasoningEnd(id, ProviderMetadata.of("anthropic", "redactedData", data)); }
        }
    }

    private static final Map<String, FinishReason> STOP_REASONS = Map.of(
        "end_turn", FinishReason.STOP,
        "stop_sequence", FinishReason.STOP,
        "pause_turn", FinishReason.STOP,
        "max_tokens", FinishReason.LENGTH,
        "model_context_window_exceeded", FinishReason.LENGTH,
        "tool_use", FinishReason.TOOL_CALLS,
        "refusal", FinishReason.CONTENT_FILTER);

    private final Supplier<String> newId;

    private Open open;
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
                close(out);
                String id = blockId != null ? blockId : index != null ? index.toString() : newId.get();
                open = switch (block) {
                    case Block.Text() -> new Open.Text(id);
                    case Block.ToolUse(var name) -> new Open.Tool(id, name);
                    case Block.Thinking() -> new Open.Thinking(id, null);
                    case Block.RedactedThinking(var data) -> new Open.Redacted(id, data);
                    case Block.Unsupported() -> null;
                };
                if (open != null) {
                    out.add(open.start());
                }
            }
            case BlockDelta(var delta) -> {
                switch (delta) {
                    case Delta.Text(var text) when open instanceof Open.Text(var id) ->
                        out.add(new TextDelta(id, text));
                    case Delta.Thinking(var thinking) when open instanceof Open.Thinking(var id, _) ->
                        out.add(new ReasoningDelta(id, thinking));
                    case Delta.InputJson(var json) when open instanceof Open.Tool(var id, _) ->
                        out.add(new ToolInputDelta(id, json));
                    // the signature rides the reasoning-end; nothing is emitted to the client
                    case Delta.Signature(var piece) when open instanceof Open.Thinking(var id, var signature) ->
                        open = new Open.Thinking(id, signature == null ? piece : signature + piece);
                    // a delta that does not belong to the open block, or no block at all
                    default -> {}
                }
            }
            case BlockStop() -> close(out);
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
        close(out);
        if (lastUsage != null) {
            out.add(new AiSdkChunk.Usage(messageId, model, lastUsage, Finish.of(STOP_REASONS, stopReason)));
        }
        return out;
    }

    private void close(List<AiSdkChunk> out) {
        if (open != null) {
            out.add(open.end());
            open = null;
        }
    }
}
