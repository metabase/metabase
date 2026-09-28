package metabase.metabot.providers.openai;

import static metabase.metabot.providers.Clj.mapOf;
import static metabase.metabot.providers.Clj.str;

import clojure.lang.IPersistentMap;
import clojure.lang.IPersistentVector;
import clojure.lang.ITransientCollection;
import clojure.lang.PersistentVector;
import clojure.lang.RT;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import metabase.metabot.providers.AiSdkPart;
import metabase.metabot.providers.AiSdkPart.Message;
import metabase.metabot.providers.AiSdkPart.Reasoning;
import metabase.metabot.providers.AiSdkPart.Text;
import metabase.metabot.providers.AiSdkPart.ToolInput;
import metabase.metabot.providers.AiSdkPart.ToolOutput;
import org.jspecify.annotations.Nullable;

/**
 * The conversation history as OpenAI Responses API `input` items.
 * https://platform.openai.com/docs/api-reference/responses/create#responses-create-input
 */
public final class ResponsesInput {
    private ResponsesInput() {}

    /** `parts` are Clojure AISDK part maps; the items come back as Clojure data, for the request body. */
    public static IPersistentVector fromClj(Iterable<? extends Map<?, ?>> parts,
                                            Function<@Nullable Object, String> encodeJson) {
        ITransientCollection items = PersistentVector.EMPTY.asTransient();
        for (var part : parts) {
            var item = item(AiSdkPart.parse(part), encodeJson);
            if (item != null) {
                items = items.conj(item);
            }
        }
        return (IPersistentVector) items.persistent();
    }

    /** The input item replaying `part`, or null for a part OpenAI cannot take back. */
    private static @Nullable IPersistentMap item(AiSdkPart part, Function<@Nullable Object, String> encodeJson) {
        return switch (part) {
            case Reasoning reasoning -> reasoningItem(reasoning);
            case Text text ->
                mapOf("type", "message",
                      "role", "assistant",
                      // RT.vector, not PersistentVector.create: a map is Iterable, so create would build a vector
                      // of its entries
                      "content", RT.vector(mapOf("type", "output_text", "text", text.text())));
            case ToolInput input ->
                mapOf("type", "function_call",
                      "call_id", input.id(),
                      "name", input.function(),
                      "arguments", input.arguments() instanceof String json ? json : encodeJson.apply(input.arguments()));
            case ToolOutput output -> {
                String text = output.result() instanceof Map<?, ?> m ? str(m, "output") : null;
                String error = output.error();
                yield mapOf("type", "function_call_output",
                            "call_id", output.id(),
                            "output", text != null ? text
                                      : error != null ? "Error: " + error
                                      : RT.printString(output.result()));
            }
            case Message(var role, var content) ->
                mapOf("role", role.name().toLowerCase(Locale.ROOT), "content", content);
        };
    }

    /**
     * With store:false the API keeps nothing server-side, so reasoning rides along as its encrypted content, ahead of
     * the tool calls it preceded. A part without that — a bare summary, another provider's — has nothing to replay.
     */
    private static @Nullable IPersistentMap reasoningItem(Reasoning reasoning) {
        var openai = reasoning.metadata("openai");
        if (openai == null) {
            return null;
        }
        String content = openai.fields().get("encryptedContent");
        if (content == null) {
            return null;
        }
        String itemId = openai.fields().get("itemId");
        return mapOf("type", "reasoning",
                     "id", itemId != null ? itemId : reasoning.id(),
                     "summary", PersistentVector.EMPTY,
                     "encrypted_content", content);
    }
}
