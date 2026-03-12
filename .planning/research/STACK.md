# Technology Stack

**Project:** Structured Query Logging
**Researched:** 2026-03-12

## Key Finding: No New Dependencies Needed

Metabase already has every library and pattern required for structured query logging. The entire stack is in place. This milestone is purely an application-level implementation task using existing infrastructure.

## Existing Stack (Use As-Is)

### Logging Framework
| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| org.apache.logging.log4j/log4j-core | 2.25.3 | Core logging engine | HIGH - verified in deps.edn |
| org.apache.logging.log4j/log4j-api | 2.25.3 | Log4j2 API | HIGH - verified in deps.edn |
| org.clojure/tools.logging | 1.3.0 | Clojure logging facade | HIGH - verified in deps.edn |
| org.slf4j/slf4j-api | 2.0.17 | SLF4J abstraction layer | HIGH - verified in deps.edn |
| org.apache.logging.log4j/log4j-slf4j2-impl | 2.25.2 | SLF4J-to-Log4j2 bridge | HIGH - verified in deps.edn |

**Why these are correct:** This is the standard JVM logging stack in 2025-2026. Log4j2 is the active successor to Log4j 1.x, with proper async support, structured context via ThreadContext, and runtime reconfiguration. The version mismatch between log4j-core (2.25.3) and log4j-slf4j2-impl (2.25.2) is minor and will not cause issues.

### MDC / Structured Context
| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Log4j2 ThreadContext | (part of log4j-api 2.25.3) | Per-thread structured context (MDC) | HIGH - already used in codebase |
| `metabase.util.log/with-thread-context` | N/A (existing macro) | Clojure wrapper for ThreadContext put/get/remove | HIGH - verified in source |

**Why ThreadContext, not SLF4J MDC:** Metabase already uses `org.apache.logging.log4j.ThreadContext` directly rather than going through SLF4J's MDC adapter. This is the right choice -- it avoids an unnecessary indirection layer since Log4j2 is the concrete implementation. The existing `with-thread-context` macro in `metabase.util.log` handles the lifecycle correctly (save/restore/cleanup).

### Log Pattern
| Component | Current Value | Purpose | Confidence |
|-----------|---------------|---------|------------|
| PatternLayout | `%date %level %logger{2} :: %message %notEmpty{%X}%n%throwable` | Console output format | HIGH - verified in log4j2.xml |

**Critical detail:** The pattern already includes `%notEmpty{%X}` which prints ALL ThreadContext values when non-empty. This means any key-value pairs added via `with-thread-context` will automatically appear in log output without any pattern changes. This is the mechanism that will carry request IDs, database IDs, and other correlation data into log lines.

### Runtime Log Level Control
| Component | Location | Purpose | Confidence |
|-----------|----------|---------|------------|
| Preset system | `metabase.logger.api` | Named bundles of namespace-level overrides, toggled via API | HIGH - verified in source |
| `set-ns-log-level!` | `metabase.logger.core` | Programmatic per-namespace level changes | HIGH - verified in source |
| Timed adjustments | `metabase.logger.api` POST `/adjustment` | Temporary level changes with auto-revert | HIGH - verified in source |

**Why this matters:** The project requirement for "logging presets to toggle detail levels without restart" is already solved. New presets just need to be added to the `presets` function in `metabase.logger.api`.

### JSON Layout (Available but Not Recommended)
| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| org.apache.logging.log4j/log4j-layout-template-json | 2.25.3 | JSON-structured log output | HIGH - in deps.edn |

**Why NOT to use for this project:** The project constraint explicitly states "Use Metabase's existing standard log format -- no custom JSON or key-value format." The JSON layout template dependency exists in deps.edn but is not the default output format. The `%X` ThreadContext pattern in the standard PatternLayout is the correct approach.

## What NOT to Add

| Library | Why Not |
|---------|---------|
| Logback | Metabase uses Log4j2. Adding Logback would create a conflicting logging backend. |
| SLF4J MDC (org.slf4j.MDC) | Metabase already uses Log4j2 ThreadContext directly. Mixing both creates confusion. |
| Timbre (com.taoensso/timbre) | Clojure-native logging library, but Metabase is committed to clojure.tools.logging + Log4j2. |
| Cambium | Clojure structured logging library. Unnecessary -- ThreadContext + `%X` pattern achieves the same result with zero new deps. |
| Mulog (com.brunobonacci/mulog) | Event-based logging for Clojure. Interesting library but incompatible with the "use existing log format" constraint. Would be a parallel logging system. |
| net.logstash.logback/logstash-logback-encoder | Logback-based, not Log4j2. Wrong backend. |

## Specific Patterns to Use

### 1. ThreadContext for Correlation IDs

```clojure
;; Already exists in metabase.util.log:
(log/with-thread-context {:request-id request-id
                          :database-id db-id}
  ;; All log lines within this scope automatically include these in %X
  (log/info "Executing query"))
;; Output: 2026-03-12 INFO m.d.s.execute :: Executing query {mb-request-id=abc123, mb-database-id=42}
```

Note: `with-thread-context-fn` automatically prefixes keys with `mb-` (see line 76 of `metabase.util.log`). So `:request-id` becomes `mb-request-id` in the ThreadContext.

### 2. New Preset for Query Logging

```clojure
;; Add to the presets function in metabase.logger.api:
{:id :query-logging
 :display_name "Analytics query logging"
 :loggers [{:name "metabase.driver.sql-jdbc.execute" :level :debug}
           ;; ... other relevant namespaces
           ]}
```

### 3. Per-Thread Context Propagation Across Async Boundaries

**Warning:** ThreadContext is thread-local. If query execution crosses thread boundaries (e.g., via `future`, `core.async`, or thread pools), the context must be explicitly propagated. The existing `with-context-meta` and `restore-thread-context!` functions in `metabase.util.log` (lines 383-395) handle this pattern for the notification system. The same approach should be used for query execution if it crosses threads.

## Installation

```bash
# No new dependencies to install.
# Everything is already in deps.edn.
```

## Version Notes

All Log4j2 components are at 2.25.x, which is current as of early 2026. Log4j2 2.25.3 includes:
- Full ThreadContext (MDC) support
- Runtime reconfiguration without restart
- PatternLayout with `%X` for context map rendering
- Async logging support (not currently used by Metabase but available)

The `clojure.tools.logging` 1.3.0 is the latest stable release and properly delegates to Log4j2 via the `-Dclojure.tools.logging.factory=clojure.tools.logging.impl/log4j2-factory` system property (set in deps.edn).

## Sources

- `/Users/rolodato/source/metabase/metabase/deps.edn` - dependency versions (lines 117-177)
- `/Users/rolodato/source/metabase/metabase/resources/log4j2.xml` - log pattern configuration
- `/Users/rolodato/source/metabase/metabase/src/metabase/util/log.clj` - ThreadContext wrapper (lines 73-106, 383-395)
- `/Users/rolodato/source/metabase/metabase/src/metabase/logger/core.clj` - logger management
- `/Users/rolodato/source/metabase/metabase/src/metabase/logger/api.clj` - preset system and runtime adjustment API
