import {
  ArrayType,
  Comment,
  Converter,
  IntrinsicType,
  LiteralType,
  ReflectionFlag,
  ReflectionKind,
  UnionType,
} from "typedoc";

/**
 * Check if a UnionType has ALL members as string LiteralTypes.
 */
function isAllStringLiteralUnion(type) {
  if (!(type instanceof UnionType)) {
    return false;
  }
  return (
    type.types.length > 0 &&
    type.types.every(
      (t) => t instanceof LiteralType && typeof t.value === "string",
    )
  );
}

/**
 * Extract the text content from a Comment tag's content array.
 */
function getTagText(tag) {
  if (!tag.content || tag.content.length === 0) {
    return "";
  }
  return tag.content.map((part) => part.text).join("");
}

/**
 * Transform @remarks text into a human-readable sentence.
 *
 * "Guest embed" → "Available in Guest embed."
 * "Pro/Enterprise" → "Available in Pro/Enterprise."
 * "Pro/Enterprise, Guest embed" → "Available in Pro/Enterprise and Guest embed."
 */
function transformRemarks(text) {
  const trimmed = text.trim();

  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((s) => s.trim());
    const last = parts.pop();
    return `Available in ${parts.join(", ")} and ${last}.`;
  }

  return `Available in ${trimmed}.`;
}

/**
 * A TypeDoc plugin that transforms property reflections before markdown
 * rendering to produce cleaner props documentation tables.
 *
 * For each property on interfaces/type aliases:
 * 1. Moves optional `?` markers into the description as "Optional."
 * 2. Extracts @defaultValue tags into the description as "Default: `value`."
 * 3. Replaces all-string-literal union types with `string` and lists possible values
 * 4. Transforms @remarks tags into human-readable availability notes
 */
export function load(app) {
  app.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
    const project = context.project;

    for (const reflection of project.getReflectionsByKind(
      ReflectionKind.Property,
    )) {
      const prefix = [];

      // 1. Optional: move ? into description
      if (reflection.flags.isOptional) {
        prefix.push("Optional");
        reflection.setFlag(ReflectionFlag.Optional, false);
      }

      // 2. Default value: extract @defaultValue tag
      if (reflection.comment) {
        const defaultTag = reflection.comment.getTag("@defaultValue");
        if (defaultTag) {
          const defaultText = getTagText(defaultTag).trim();

          // If the value already contains backticks, use as-is
          if (defaultText.includes("`")) {
            prefix.push(`Default: ${defaultText}`);
          } else {
            prefix.push(`Default: \`${defaultText}\``);
          }

          reflection.comment.removeTags("@defaultValue");
        }
      }

      // 3. Complex union types: simplify all-string-literal unions
      let unionType = null;

      if (isAllStringLiteralUnion(reflection.type)) {
        unionType = reflection.type;
        reflection.type = new IntrinsicType("string");
      } else if (
        reflection.type instanceof ArrayType &&
        isAllStringLiteralUnion(reflection.type.elementType)
      ) {
        unionType = reflection.type.elementType;
        reflection.type = new ArrayType(new IntrinsicType("string"));
      }

      if (unionType) {
        const values = unionType.types
          .map((t) => `\`"${t.value}"\``)
          .join(", ");
        prefix.push(`Possible values: ${values}`);
      }

      // 4. Remarks: transform into availability notes
      if (reflection.comment) {
        const remarksTag = reflection.comment.getTag("@remarks");
        if (remarksTag) {
          const remarksText = getTagText(remarksTag);
          if (remarksText.trim()) {
            prefix.push(transformRemarks(remarksText));
          }
          reflection.comment.removeTags("@remarks");
        }
      }

      // Assemble prefix and prepend to comment summary
      if (prefix.length > 0) {
        if (!reflection.comment) {
          reflection.comment = new Comment();
        }

        const prefixText = ["---", ...prefix].join("<br>");
        const existingSummary = reflection.comment.summary || [];

        if (existingSummary.length > 0) {
          reflection.comment.summary = [
            ...existingSummary,
            { kind: "text", text: "<br>" + prefixText },
          ];
        } else {
          reflection.comment.summary = [{ kind: "text", text: prefixText }];
        }
      }
    }
  });
}
