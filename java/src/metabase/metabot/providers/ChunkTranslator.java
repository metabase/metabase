package metabase.metabot.providers;

import clojure.lang.IPersistentMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Translates one provider stream of `E` events into AI SDK chunks. One instance per stream; not thread-safe.
 *
 * <p>A provider implements {@link #parse}, {@link #step} and {@link #finish}; the Clojure side drives it through
 * {@link #stepClj} and {@link #finishClj} (see `metabase.metabot.self.core/translator-xf`).
 */
public interface ChunkTranslator<E> {

    /** A decoded SSE event, keyword-keyed, into this provider's event type. */
    E parse(Map<?, ?> event);

    List<AiSdkChunk> step(E event);

    /** End of stream: close whatever the provider left open, e.g. when it cut the stream short. */
    List<AiSdkChunk> finish();

    default List<IPersistentMap> stepClj(Map<?, ?> event) {
        return render(step(parse(event)));
    }

    default List<IPersistentMap> finishClj() {
        return render(finish());
    }

    private static List<IPersistentMap> render(List<AiSdkChunk> chunks) {
        var out = new ArrayList<IPersistentMap>(chunks.size());
        for (var chunk : chunks) {
            out.add(AiSdkChunk.toClj(chunk));
        }
        return out;
    }
}
