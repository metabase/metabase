package metabase.metabot.providers;

import java.util.List;
import metabase.metabot.providers.AiSdkChunk.ProviderMetadata;
import metabase.metabot.providers.AiSdkChunk.ReasoningDelta;
import metabase.metabot.providers.AiSdkChunk.ReasoningEnd;
import metabase.metabot.providers.AiSdkChunk.ReasoningStart;
import metabase.metabot.providers.AiSdkChunk.TextDelta;
import metabase.metabot.providers.AiSdkChunk.TextEnd;
import metabase.metabot.providers.AiSdkChunk.TextStart;
import metabase.metabot.providers.AiSdkChunk.ToolInputAvailable;
import metabase.metabot.providers.AiSdkChunk.ToolInputDelta;
import metabase.metabot.providers.AiSdkChunk.ToolInputStart;
import org.jspecify.annotations.Nullable;

/**
 * A part of the response while it streams: AI SDK brackets each one in start / delta* / end chunks, and every
 * provider stream we translate has at most one open at a time.
 */
public sealed interface Part {
    AiSdkChunk start();
    AiSdkChunk delta(String delta);
    AiSdkChunk end();

    record Text(String id) implements Part {
        @Override public AiSdkChunk start() { return new TextStart(id); }
        @Override public AiSdkChunk delta(String d) { return new TextDelta(id, d); }
        @Override public AiSdkChunk end() { return new TextEnd(id); }
    }

    /** `metadata` rides the start, where replay reads it from; see {@link ToolInputStart}. */
    record Tool(String id, String name, @Nullable ProviderMetadata metadata) implements Part {
        public Tool(String id, String name) { this(id, name, null); }
        @Override public AiSdkChunk start() { return new ToolInputStart(id, name, metadata); }
        @Override public AiSdkChunk delta(String d) { return new ToolInputDelta(id, d); }
        @Override public AiSdkChunk end() { return new ToolInputAvailable(id, name); }
    }

    /** `metadata` is what the provider needs to see again to replay this block, once it has sent any. */
    record Reasoning(String id, @Nullable ProviderMetadata metadata) implements Part {
        public Reasoning(String id) { this(id, null); }
        @Override public AiSdkChunk start() { return new ReasoningStart(id); }
        @Override public AiSdkChunk delta(String d) { return new ReasoningDelta(id, d); }
        @Override public AiSdkChunk end() { return new ReasoningEnd(id, metadata); }
    }

    /** The one part a translator has open, if any. */
    final class Slot {
        private @Nullable Part open;

        public @Nullable Part get() {
            return open;
        }

        /** End the open part, if any, then start `next`. */
        public <P extends Part> P start(List<AiSdkChunk> out, P next) {
            close(out);
            open = next;
            out.add(next.start());
            return next;
        }

        /** Swap the open part for an updated copy of itself, emitting nothing. */
        public void update(Part updated) {
            open = updated;
        }

        public void close(List<AiSdkChunk> out) {
            if (open != null) {
                out.add(open.end());
                open = null;
            }
        }
    }
}
