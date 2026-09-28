package metabase.metabot.providers;

import clojure.lang.IPersistentMap;
import clojure.lang.Keyword;
import clojure.lang.PersistentArrayMap;
import java.util.List;
import java.util.Map;

/**
 * The whole Clojure-data boundary: reading keyword-keyed maps decoded off the wire, and building the
 * keyword-keyed maps the rest of Metabot consumes. Nothing past the parse/render edges touches these.
 */
public final class Clj {
    private Clj() {}

    public static Keyword kw(String name) {
        return Keyword.intern(name);
    }

    private static Object get(Map<?, ?> m, String key) {
        return m == null ? null : m.get(kw(key));
    }

    public static Map<?, ?> map(Map<?, ?> m, String key) {
        return get(m, key) instanceof Map<?, ?> v ? v : null;
    }

    /** The first element of a sequential value, when it is a map. */
    public static Map<?, ?> firstMap(Map<?, ?> m, String key) {
        return get(m, key) instanceof List<?> l && !l.isEmpty() && l.get(0) instanceof Map<?, ?> head ? head : null;
    }

    public static String str(Map<?, ?> m, String key) {
        return get(m, key) instanceof String v ? v : null;
    }

    /** A map's `:type`, or "" without one, so a parser can `switch` on it directly. */
    public static String type(Map<?, ?> m) {
        return str(m, "type") instanceof String t ? t : "";
    }

    public static long num(Map<?, ?> m, String key) {
        return get(m, key) instanceof Number v ? v.longValue() : 0L;
    }

    public static Long optNum(Map<?, ?> m, String key) {
        return get(m, key) instanceof Number v ? v.longValue() : null;
    }

    /**
     * Keyword-keyed map from alternating `"key", value` pairs, which must be distinct. Nil values are kept, as a
     * Clojure literal would.
     */
    public static IPersistentMap mapOf(Object... kvs) {
        for (int i = 0; i < kvs.length; i += 2) {
            kvs[i] = kw((String) kvs[i]);
        }
        return new PersistentArrayMap(kvs);
    }
}
