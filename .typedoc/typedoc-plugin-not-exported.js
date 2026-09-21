import { Comment, Converter } from "typedoc";

const TAG = "@notExported";

export function load(app) {
  app.options.getDeclaration("blockTags").defaultValue?.push?.(TAG);

  app.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
    const project = context.project;
    const intentional = new Set(app.options.getValue("intentionallyNotExported"));

    for (const id in project.reflections) {
      const ref = project.reflections[id];
      const tags = ref.comment?.blockTags ?? [];
      for (const tag of tags) {
        if (tag.tag === TAG) {
          const name = Comment.combineDisplayParts(tag.content).trim();
          if (name) {
            intentional.add(name);
          }
        }
      }
    }

    app.options.setValue("intentionallyNotExported", [...intentional]);
  });
}
