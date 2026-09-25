// Frontend file -> module/area, backend class -> namespace -> module, and API route -> canonical shape -> backend module.
import fs from "node:fs";
import path from "node:path";

import micromatch from "micromatch";

import { buildRouteTable, matchRoute, normalizeRoute } from "../../routes.mjs";

export async function loadMappings({ srcDir, openapiFile }) {
  const { elements } = await import(
    path.join(srcDir, "frontend/lint/module-boundaries.mjs")
  );

  const feNodes = elements.map((el) => ({
    type: el.type,
    regex: micromatch.makeRe(el.pattern, { dot: true }),
  }));
  const feModuleCache = new Map();
  function feModuleOf(file) {
    let module = feModuleCache.get(file);
    if (module === undefined) {
      module = feNodes.find((node) => node.regex.test(file))?.type ?? null;
      if (module === null) {
        const parts = file.split("/");
        module = `unmapped/${parts.slice(0, Math.min(parts.length - 1, 4)).join("/")}`;
      }
      feModuleCache.set(file, module);
    }
    return module;
  }

  function feAreaOf(file) {
    if (file.startsWith("target/cljs_release/")) {
      return "cljs";
    }
    const m =
      file.match(/^enterprise\/frontend\/src\/metabase-enterprise\/([^/]+)/) ??
      file.match(/^frontend\/src\/metabase\/([^/]+)\/([^/]+)?/) ??
      file.match(/^(frontend\/src\/[^/]+)/);
    if (!m) {
      return `other/${file.split("/").slice(0, 3).join("/")}`;
    }
    if (file.startsWith("enterprise/")) {
      return `ee/${m[1]}`;
    }
    if (file.startsWith("frontend/src/metabase/")) {
      return m[2] && !m[2].includes(".") ? `${m[1]}/${m[2]}` : m[1];
    }
    return m[1];
  }

  function parseRouteMap(file, basePrefix) {
    const text = fs.readFileSync(file, "utf8");
    const aliases = {};
    for (const m of text.matchAll(/\[(metabase[\w.-]*)\s+:as\s+([\w.-]+)\]/g)) {
      aliases[m[2]] = m[1];
    }
    const lines = text.split("\n");
    const result = {};
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(/^\s*\{?\s*"(\/[^"]+)"\s+(.*)$/);
      const naughtyApps = lines[i].match(
        /^\s*\(str "\/" request\/data-app-url-segment\)\s+(.*)$/,
      );
      if (!m && !naughtyApps) {
        continue;
      }
      const prefix = m ? m[1] : "/apps";
      let rest = m ? m[2] : naughtyApps[1];
      for (
        let j = i + 1;
        j < lines.length && !/^\s*"\//.test(lines[j]);
        j += 1
      ) {
        rest += " " + lines[j];
        if (j - i > 6) {
          break;
        }
      }
      let ns = rest.match(
        /'?(metabase(?:-enterprise)?\.[\w.-]+?)(?=\/|\)|\s|$)/,
      )?.[1];
      if (!ns) {
        const alias = rest.match(/\(?-?>?\s*([\w.-]+)\/routes/)?.[1];
        ns = alias && aliases[alias];
      }
      if (ns && prefix !== "/ee") {
        result[basePrefix + prefix] = ns;
      }
    }
    return result;
  }
  const eeMap = parseRouteMap(
    path.join(
      srcDir,
      "enterprise/backend/src/metabase_enterprise/api_routes/routes.clj",
    ),
    "/api",
  );
  const eeRoutes = {};
  for (const [prefix, ns] of Object.entries(eeMap)) {
    const naughty = [
      "/api/moderation-review",
      "/api/apps",
      "/api/mt",
      "/api/table",
    ];
    eeRoutes[
      naughty.includes(prefix) ? prefix : prefix.replace(/^\/api/, "/api/ee")
    ] = ns;
  }
  // EE's /api/table only adds the sandbox endpoints, everything else is the OSS table routes.
  delete eeRoutes["/api/table"];
  const prefixToNs = {
    ...parseRouteMap(
      path.join(srcDir, "src/metabase/api_routes/routes.clj"),
      "/api",
    ),
    ...eeRoutes,
  };

  const configText = fs.readFileSync(
    path.join(srcDir, ".clj-kondo/config/modules/config.edn"),
    "utf8",
  );
  const beModules = [];
  const moduleRe = /^ {1,2}([a-z][\w./-]*)\s*\n\s*\{:team/gm;
  let mm;
  while ((mm = moduleRe.exec(configText))) {
    const name = mm[1];
    const block = configText.slice(mm.index, mm.index + 400);
    const explicit = block.match(/:ns-prefix\s+"([^"]+)"/)?.[1];
    const nsPrefix =
      explicit ??
      (name.startsWith("enterprise/")
        ? `metabase-enterprise.${name.slice("enterprise/".length)}`
        : `metabase.${name}`);
    beModules.push({ name, nsPrefix });
  }
  beModules.sort((a, b) => b.nsPrefix.length - a.nsPrefix.length);
  const beModuleCache = new Map();
  function beModuleOfNs(ns) {
    let module = beModuleCache.get(ns);
    if (module === undefined) {
      module =
        beModules.find(
          (m) => ns === m.nsPrefix || ns.startsWith(m.nsPrefix + "."),
        )?.name ?? `unmapped-ns/${ns.split(".").slice(0, 3).join(".")}`;
      beModuleCache.set(ns, module);
    }
    return module;
  }

  // JVM class names are munged namespaces: "metabase/api/card$fn__123" is metabase.api.card.
  // Namespace loaders end in "__init", and deftype, defrecord and proxy classes sit in the namespace's package.
  function classNs(name) {
    let base = name.split("$")[0];
    if (base.endsWith("__init")) {
      base = base.slice(0, -"__init".length);
    }
    const parts = base.split("/");
    const last = parts[parts.length - 1];
    if (parts.length > 1 && (/^[A-Z]/.test(last) || last === "proxy")) {
      parts.pop();
    }
    return parts.join(".").replace(/_/g, "-");
  }

  const prefixes = Object.keys(prefixToNs).sort((a, b) => b.length - a.length);
  function beModuleOfRoute(route) {
    const pathname = route.slice(route.indexOf(" ") + 1);
    const prefix = prefixes.find(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    return prefix ? beModuleOfNs(prefixToNs[prefix]) : "unmapped-route";
  }

  const routeTable = fs.existsSync(openapiFile)
    ? buildRouteTable(JSON.parse(fs.readFileSync(openapiFile, "utf8")))
    : null;
  function canonicalRoute(route) {
    const normalized = normalizeRoute(route);
    if (!routeTable) {
      return normalized;
    }
    const sep = normalized.indexOf(" ");
    const method = normalized.slice(0, sep);
    const shape = matchRoute(routeTable, method, normalized.slice(sep + 1));
    return shape ? `${method} ${shape}` : `${normalized} [no-openapi]`;
  }

  return {
    feModuleOf,
    feAreaOf,
    classNs,
    beModuleOfNs,
    beModuleOfRoute,
    canonicalRoute,
    hasOpenapi: routeTable !== null,
    prefixToNs,
  };
}
