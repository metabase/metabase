package metabase.metabot.providers;

import static metabase.metabot.providers.Clj.get;
import static metabase.metabot.providers.Clj.map;
import static metabase.metabot.providers.Clj.name;
import static metabase.metabot.providers.Clj.str;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import metabase.metabot.providers.AiSdkChunk.ProviderMetadata;
import org.jspecify.annotations.Nullable;

/**
 * One element of the conversation history an adapter replays to its provider: an AI SDK part the agent loop
 * produced, or a plain role message. The inbound counterpart of {@link AiSdkChunk}, parsed from the maps
 * `metabase.metabot.self.core/AISDKPart` describes.
 *
 * <p>Unlike that schema, which in production only logs what does not conform, parsing refuses a role it does not
 * know: that is a message the provider would reject anyway.
 */
public sealed interface AiSdkPart {

    enum Role { USER, SYSTEM, ASSISTANT, TOOL }

    /** A message the user, or the system, wrote; also what an untyped part replays as. */
    record Message(Role role, String content) implements AiSdkPart {}

    record Text(@Nullable String text) implements AiSdkPart {}

    /** `metadata` holds what each provider needs to replay the block, keyed by provider; a foreign one has none. */
    record Reasoning(@Nullable String id, @Nullable String text, Map<String, ProviderMetadata> metadata)
        implements AiSdkPart {
        public Reasoning {
            metadata = Map.copyOf(metadata);
        }

        public @Nullable ProviderMetadata metadata(String provider) {
            return metadata.get(provider);
        }
    }

    /** `arguments` are a JSON string, as the provider streamed them, or Clojure data built since. */
    record ToolInput(@Nullable String id, @Nullable String function, @Nullable Object arguments) implements AiSdkPart {}

    /**
     * What a tool returned, as its raw Clojure return value. `error` is set, possibly empty, when the call failed.
     */
    record ToolOutput(@Nullable String id, @Nullable Object result, @Nullable String error) implements AiSdkPart {}

    static AiSdkPart parse(Map<?, ?> part) {
        String type = name(part, "type");
        return switch (type == null ? "" : type) {
            case "text" -> new Text(str(part, "text"));
            case "reasoning" -> new Reasoning(str(part, "id"), str(part, "text"),
                                              parseMetadata(map(part, "provider-metadata")));
            case "tool-input" -> new ToolInput(str(part, "id"), str(part, "function"), get(part, "arguments"));
            case "tool-output" -> {
                Map<?, ?> error = map(part, "error");
                String message = str(error, "message");
                yield new ToolOutput(str(part, "id"), get(part, "result"),
                                     error == null ? null : message != null ? message : "");
            }
            default -> {
                String content = str(part, "content");
                yield new Message(parseRole(name(part, "role")), content != null ? content : "");
            }
        };
    }

    private static Role parseRole(@Nullable String role) {
        if (role == null) {
            return Role.USER;
        }
        try {
            return Role.valueOf(role.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("not a message role: " + role, e);
        }
    }

    private static Map<String, ProviderMetadata> parseMetadata(@Nullable Map<?, ?> byProvider) {
        var out = new LinkedHashMap<String, ProviderMetadata>();
        if (byProvider != null) {
            for (var entry : byProvider.entrySet()) {
                if (entry.getValue() != null) {
                    var one = ProviderMetadata.fromClj(entry.getKey(), entry.getValue());
                    out.put(one.provider(), one);
                }
            }
        }
        return out;
    }
}
