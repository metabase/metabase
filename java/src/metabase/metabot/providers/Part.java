package metabase.metabot.providers;

import java.util.List;
import metabase.metabot.providers.AiSdkChunk.*;

/**
 * A part of the response while it streams: AI SDK brackets each one in start / delta* / end chunks, and every
 * provider stream we translate has at most one open at a time.
 */
public sealed interface Part {
    AiSdkChunk start();
    AiSdkChunk delta(String delta);
    AiSdkChunk end();

    record Text(String id) implements Part {
        public AiSdkChunk start() { return new TextStart(id); }
        public AiSdkChunk delta(String d) { return new TextDelta(id, d); }
        public AiSdkChunk end() { return new TextEnd(id); }
    }

    /** `metadata` rides the start, where replay reads it from; see {@link ToolInputStart}. */
    record Tool(String id, String name, ProviderMetadata metadata) implements Part {
        public Tool(String id, String name) { this(id, name, null); }
        public AiSdkChunk start() { return new ToolInputStart(id, name, metadata); }
        public AiSdkChunk delta(String d) { return new ToolInputDelta(id, d); }
        public AiSdkChunk end() { return new ToolInputAvailable(id, name); }
    }

    /** `metadata` is what the provider needs to see again to replay this block, once it has sent any. */
    record Reasoning(String id, ProviderMetadata metadata) implements Part {
        public Reasoning(String id) { this(id, null); }
        public AiSdkChunk start() { return new ReasoningStart(id); }
        public AiSdkChunk delta(String d) { return new ReasoningDelta(id, d); }
        public AiSdkChunk end() { return new ReasoningEnd(id, metadata); }
    }

    /** The one part a translator has open, if any. */
    final class Slot {
        private Part open;

        public Part get() {
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
