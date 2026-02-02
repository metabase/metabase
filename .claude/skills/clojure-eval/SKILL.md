---
name: clojure-eval
description: Evaluate Clojure code via nREPL using clj-nrepl-eval. Use this when you need to test code, check if edited files compile, verify function behavior, or interact with a running REPL session.
---

# Clojure REPL Evaluation

## When to Use This Skill

Use this skill when you need to:
- **Verify that edited Clojure files compile and load correctly**
- Test function behavior interactively
- Check the current state of the REPL
- Debug code by evaluating expressions
- Require or load namespaces for testing
- Validate that code changes work before committing

## How It Works

The `clj-nrepl-eval` command evaluates Clojure code against an nREPL server. **Session state persists between evaluations**, so you can require a namespace in one evaluation and use it in subsequent calls. Each host:port combination maintains its own session file.

## Instructions

### 0. Discover and select nREPL server

First, discover what nREPL servers are running in the current directory:

```bash
clj-nrepl-eval --discover-ports
```

This will show all nREPL servers (Clojure, Babashka, shadow-cljs, etc.) running in the current project directory.

**Then use the AskUserQuestion tool:**

- **If ports are discovered:** Prompt user to select which nREPL port to use:
  - **question:** "Which nREPL port would you like to use?"
  - **header:** "nREPL Port"
  - **options:** Present each discovered port as an option with:
    - **label:** The port number 
    - **description:** The server type and status (e.g., "Clojure nREPL server in current directory")
  - Include up to 4 discovered ports as options
  - The user can select "Other" to enter a custom port number

- **If no ports are discovered:** Prompt user how to start an nREPL server:
  - **question:** "No nREPL servers found. How would you like to start one?"
  - **header:** "Start nREPL"
  - **options:**
    - **label:** "deps.edn alias", **description:** "Find and use an nREPL alias in deps.edn"
    - **label:** "Leiningen", **description:** "Start nREPL using 'lein repl'"
  - The user can select "Other" for alternative methods or if they already have a server running on a specific port

IMPORTANT: IF you start a REPL do not supply a port let the nREPL start and return the port that it was started on.

### 1. Evaluate Clojure Code

> Evaluation automatically connects to the given port

Use the `-p` flag to specify the port and pass your Clojure code.

**Recommended: Pass code as a command-line argument:**
```bash
clj-nrepl-eval -p <PORT> "(+ 1 2 3)"
```

**For multiple expressions (single line):**
```bash
clj-nrepl-eval -p <PORT> "(def x 10) (+ x 20)"
```

**Alternative: Using heredoc (may require permission approval for multiline commands):**
```bash
clj-nrepl-eval -p <PORT> <<'EOF'
(def x 10)
(+ x 20)
EOF
```

**Alternative: Via stdin pipe:**
```bash
echo "(+ 1 2 3)" | clj-nrepl-eval -p <PORT>
```

### 2. Display nREPL Sessions

**Discover all nREPL servers in current directory:**
```bash
clj-nrepl-eval --discover-ports
```
Shows all running nREPL servers in the current project directory, including their type (clj/bb/basilisp) and whether they match the current working directory.

**Check previously connected sessions:**
```bash
clj-nrepl-eval --connected-ports
```
Shows only connections you have made before (appears after first evaluation on a port).

### 3. Common Patterns

**Require a namespace (always use :reload to pick up changes):**
```bash
clj-nrepl-eval -p <PORT> "(require '[my.namespace :as ns] :reload)"
```

**Test a function after requiring:**
```bash
clj-nrepl-eval -p <PORT> "(ns/my-function arg1 arg2)"
```

**Check if a file compiles:**
```bash
clj-nrepl-eval -p <PORT> "(require 'my.namespace :reload)"
```

**Multiple expressions:**
```bash
clj-nrepl-eval -p <PORT> "(def x 10) (* x 2) (+ x 5)"
```

**Complex multiline code (using heredoc):**
```bash
clj-nrepl-eval -p <PORT> <<'EOF'
(def x 10)
(* x 2)
(+ x 5)
EOF
```
*Note: Heredoc syntax may require permission approval.*

**With custom timeout (in milliseconds):**
```bash
clj-nrepl-eval -p <PORT> --timeout 5000 "(long-running-fn)"
```

**Reset the session (clears all state):**
```bash
clj-nrepl-eval -p <PORT> --reset-session
clj-nrepl-eval -p <PORT> --reset-session "(def x 1)"
```

## Available Options

- `-p, --port PORT` - nREPL port (required)
- `-H, --host HOST` - nREPL host (default: 127.0.0.1)
- `-t, --timeout MILLISECONDS` - Timeout (default: 120000 = 2 minutes)
- `-r, --reset-session` - Reset the persistent nREPL session
- `-c, --connected-ports` - List previously connected nREPL sessions
- `-d, --discover-ports` - Discover nREPL servers in current directory
- `-h, --help` - Show help message

## Important Notes

- **Prefer command-line arguments:** Pass code as quoted strings: `clj-nrepl-eval -p <PORT> "(+ 1 2 3)"` - works with existing permissions
- **Heredoc for complex code:** Use heredoc (`<<'EOF' ... EOF`) for truly multiline code, but note it may require permission approval
- **Sessions persist:** State (vars, namespaces, loaded libraries) persists across invocations until the nREPL server restarts or `--reset-session` is used
- **Automatic delimiter repair:** The tool automatically repairs missing or mismatched parentheses
- **Always use :reload:** When requiring namespaces, use `:reload` to pick up recent changes
- **Default timeout:** 2 minutes (120000ms) - increase for long-running operations
- **Input precedence:** Command-line arguments take precedence over stdin

## Typical Workflow

1. Discover nREPL servers: `clj-nrepl-eval --discover-ports`
2. Use **AskUserQuestion** tool to prompt user to select a port
3. Require namespace:
   ```bash
   clj-nrepl-eval -p <PORT> "(require '[my.ns :as ns] :reload)"
   ```
4. Test function:
   ```bash
   clj-nrepl-eval -p <PORT> "(ns/my-fn ...)"
   ```
5. Iterate: Make changes, re-require with `:reload`, test again