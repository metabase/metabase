package metabase.metabot.providers.chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import metabase.metabot.providers.AiSdkChunk;
import metabase.metabot.providers.AiSdkChunk.*;
import metabase.metabot.providers.ChunkTranslator;
import metabase.metabot.providers.Part;
import metabase.metabot.providers.chat.ChatChunk.Content;

/**
 * Translates one OpenAI-compatible Chat Completions stream into AI SDK v5 chunks. Shared by every adapter whose
 * provider speaks the dialect; each passes its own stop-reason table.
 *
 * <p>The stream never says when a part starts or ends, so the translator infers it: a part stays open until a delta
 * of another kind arrives, a tool call with a new id starts, or the choice finishes.
 */
public final class ChatCompletionsTranslator implements ChunkTranslator<ChatChunk> {

    private final Supplier<String> newId;
    private final Map<String, FinishReason> stopReasons;
    /**
     * Whether reasoning deltas become reasoning parts. Opt-in: whether a provider's reasoning renders at all is a
     * separate question, and chunks nothing consumes only add stream volume.
     */
    private final boolean forwardReasoning;

    private final Part.Slot open = new Part.Slot();
    private String messageId;
    private String model;
    private String stopReason;

    public ChatCompletionsTranslator(Supplier<String> newId,
                                     Map<String, FinishReason> stopReasons,
                                     boolean forwardReasoning) {
        this.newId = newId;
        this.stopReasons = stopReasons;
        this.forwardReasoning = forwardReasoning;
    }

    @Override
    public ChatChunk parse(Map<?, ?> event) {
        return ChatChunk.parse(event);
    }

    @Override
    public List<AiSdkChunk> step(ChatChunk chunk) {
        var out = new ArrayList<AiSdkChunk>(2);
        if (chunk.id() != null && messageId == null) {
            messageId = chunk.id();
            model = chunk.model();
            out.add(new Start(messageId));
        }
        switch (chunk.content()) {
            case Content.Text(var text) -> {
                var part = open.get() instanceof Part.Text t ? t : open.start(out, new Part.Text(newId.get()));
                out.add(part.delta(text));
            }
            case Content.Reasoning(var text) when forwardReasoning -> {
                var part = open.get() instanceof Part.Reasoning r ? r : open.start(out, new Part.Reasoning(newId.get()));
                out.add(part.delta(text));
            }
            case Content.ToolCallStart(var id, var name, var arguments) -> {
                // a tool call without a name cannot be started; the open part still ends here
                open.close(out);
                if (name != null) {
                    var part = open.start(out, new Part.Tool(id, name));
                    if (arguments != null && !arguments.isBlank()) {
                        out.add(part.delta(arguments));
                    }
                }
            }
            case Content.ToolCallArguments(var arguments) when open.get() instanceof Part.Tool part -> {
                if (arguments != null) {
                    out.add(part.delta(arguments));
                }
            }
            // arguments with no tool call open to receive them
            case Content.ToolCallArguments _ -> open.close(out);
            case Content.Reasoning _, Content.None _ -> {}
        }
        if (chunk.reasoningMetadata() != null && open.get() instanceof Part.Reasoning(var id, _)) {
            open.update(new Part.Reasoning(id, chunk.reasoningMetadata()));
        }
        if (chunk.finishReason() != null) {
            stopReason = chunk.finishReason();
            open.close(out);
        }
        // usage often rides a final chunk of its own, with no choices
        if (chunk.usage() != null) {
            out.add(new AiSdkChunk.Usage(messageId, model, chunk.usage(), Finish.of(stopReasons, stopReason)));
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
