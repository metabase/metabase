# Metabase

The instance side of Metabase content: what an instance stores, serves, and exchanges with a repository through serialization. The repository side of the same language lives in the Metabase Representation Format's own glossary.

## Language

### Custom visualizations

**Custom Viz Plugin**:
The installable unit that adds a visualization to an instance: a Bundle plus the settings an admin keeps for it (enabled or not).
_Avoid_: Custom visualization (when meaning the installed unit), viz plugin, visualization plugin, custom viz

**Identifier**:
The string that names a Custom Viz Plugin on an instance, in `custom:<identifier>` card displays, and as its directory in a repository. It is the Manifest's `name`, kept exactly as written, including case. It contains no `:`, `/`, `\` or whitespace and does not start with `.`.
_Avoid_: Slug, name (ambiguous with display name), plugin id

**Bundle**:
The built output a Custom Viz Plugin ships as, packed into one tar.gz: a Manifest, the built JavaScript, and its icon. An instance stores the archive as uploaded; a repository holds its files unpacked beside the plugin's entity file, and an import packs them back.
_Avoid_: Zip, package, dist (when meaning the whole unit)

**Manifest** (of a Custom Viz Plugin):
The `metabase-plugin.json` at the root of a Bundle: the plugin's name, icon, and the Metabase and SDK versions it was built for. Everything an instance shows about a plugin beyond its Identifier and enabled state derives from it.
_Avoid_: Plugin config, package.json

**Dev-only plugin**:
A Custom Viz Plugin that has no Bundle and is served from a developer's local URL instead. It exists only on its instance and is never exported.
_Avoid_: Dev plugin, unbundled plugin

**Resource file**:
A file serialization writes beside an entity's YAML and reads back with it, such as a Bundle's archive. Serialization owns resource files; other files in the same directory belong to their author.
_Avoid_: Sibling file, attachment, asset (when meaning the serialization mechanism)
