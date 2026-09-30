package metabase.metabot.providers;

import clojure.lang.IPersistentMap;
import clojure.lang.Keyword;
import clojure.lang.Named;
import clojure.lang.PersistentArrayMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;

/**
 * The whole Clojure-data boundary: reading keyword-keyed maps decoded off the wire, and building the
 * keyword-keyed maps the rest of Metabot consumes. Nothing past the parse/render edges touches these.
 *
 * <p>The readers take the map a previous read returned, which may be absent, and return null for a missing key or a
 * value of another type, as {@code get} and friends would in Clojure.
 */
public final class Clj {
    private Clj() {}

    public static Keyword kw(String name) {
        return Keyword.intern(name);
    }

    public static @Nullable Object get(@Nullable Map<?, ?> m, String key) {
        return m == null ? null : m.get(kw(key));
    }

    public static @Nullable Map<?, ?> map(@Nullable Map<?, ?> m, String key) {
        return get(m, key) instanceof Map<?, ?> v ? v : null;
    }

    /** The first element of a sequential value, when it is a map. */
    public static @Nullable Map<?, ?> firstMap(@Nullable Map<?, ?> m, String key) {
        return get(m, key) instanceof List<?> l && !l.isEmpty() && l.get(0) instanceof Map<?, ?> head ? head : null;
    }

    public static @Nullable String str(@Nullable Map<?, ?> m, String key) {
        return get(m, key) instanceof String v ? v : null;
    }

    /** The name of a keyword or symbol value, or the string itself; null for anything else. */
    public static @Nullable String name(@Nullable Map<?, ?> m, String key) {
        return switch (get(m, key)) {
            case Named n -> n.getName();
            case String s -> s;
            case null, default -> null;
        };
    }

    /** A map's `:type`, or "" without one, so a parser can `switch` on it directly. */
    public static String type(@Nullable Map<?, ?> m) {
        String type = str(m, "type");
        return type != null ? type : "";
    }

    /** Clojure truthiness: anything but nil and false. */
    public static boolean truthy(@Nullable Map<?, ?> m, String key) {
        Object v = get(m, key);
        return v != null && !(v instanceof Boolean b && !b);
    }

    public static long num(@Nullable Map<?, ?> m, String key) {
        return get(m, key) instanceof Number v ? v.longValue() : 0L;
    }

    /**
     * `ifPresent` of `value` when there is one, else `ifAbsent`: how a parser turns a value the wire may omit into a
     * variant that has it, or one that says it is missing.
     */
    public static <T, R> R present(@Nullable T value, Function<T, R> ifPresent, Supplier<R> ifAbsent) {
        return value != null ? ifPresent.apply(value) : ifAbsent.get();
    }

    /**
     * Keyword-keyed map from alternating `"key", value` pairs, which must be distinct. Nil values are kept, as a
     * Clojure literal would.
     */
    public static IPersistentMap mapOf(@Nullable Object... kvs) {
        for (int i = 0; i < kvs.length; i += 2) {
            kvs[i] = kw((String) Objects.requireNonNull(kvs[i], "key"));
        }
        return new PersistentArrayMap(kvs);
    }
}
