// static-viz-worker: sandboxed QuickJS runner for the static-viz bundle.
//
// One render per process: the JVM spawns a worker, feeds it JSON on stdin,
// reads JSON on stdout, and the process exits. Process isolation is the
// security boundary; the engine itself gets no filesystem, network, timer,
// or module access — only the ECMAScript intrinsics plus the two globals
// the bundle defines.
//
// Usage:
//   static-viz-worker version
//     Print an identifier for the engine build (used to key bytecode caches).
//   static-viz-worker compile <in.js> <out.qbc>
//     Compile a classic script to QuickJS bytecode. Bytecode is only valid
//     for the exact engine build that produced it — always key caches on
//     `version` output.
//   static-viz-worker render <bundle.js|bundle.qbc> <function>
//     Evaluate the bundle, call MetabaseStaticViz.<function> with stdin
//     (UTF-8 string) as the single argument, write the returned string to
//     stdout.
//
// Exit codes: 0 success, 1 JavaScript error, 2 usage/IO error.
//
// Environment:
//   STATIC_VIZ_WORKER_MEMORY_LIMIT_MB  JS heap limit (default 512)
//   STATIC_VIZ_WORKER_STACK_LIMIT_MB   JS stack limit (default 8)

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "quickjs.h"

#define DEFAULT_MEMORY_LIMIT_MB 512
#define DEFAULT_STACK_LIMIT_MB 8

static size_t env_mb(const char *name, size_t default_mb) {
    const char *val = getenv(name);
    if (val == NULL || *val == '\0') {
        return default_mb * 1024 * 1024;
    }
    char *end = NULL;
    long mb = strtol(val, &end, 10);
    if (end == val || *end != '\0' || mb <= 0) {
        fprintf(stderr, "invalid %s: %s\n", name, val);
        exit(2);
    }
    return (size_t)mb * 1024 * 1024;
}

static char *read_file(const char *path, size_t *out_len) {
    FILE *f = fopen(path, "rb");
    if (f == NULL) {
        return NULL;
    }
    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return NULL;
    }
    long len = ftell(f);
    if (len < 0) {
        fclose(f);
        return NULL;
    }
    rewind(f);
    char *buf = malloc((size_t)len + 1);
    if (buf == NULL || fread(buf, 1, (size_t)len, f) != (size_t)len) {
        fclose(f);
        free(buf);
        return NULL;
    }
    fclose(f);
    buf[len] = '\0';
    *out_len = (size_t)len;
    return buf;
}

static char *read_stdin(size_t *out_len) {
    size_t cap = 1 << 20;
    size_t len = 0;
    char *buf = malloc(cap);
    if (buf == NULL) {
        return NULL;
    }
    size_t n;
    while ((n = fread(buf + len, 1, cap - len, stdin)) > 0) {
        len += n;
        if (len == cap) {
            cap *= 2;
            char *grown = realloc(buf, cap);
            if (grown == NULL) {
                free(buf);
                return NULL;
            }
            buf = grown;
        }
    }
    if (ferror(stdin)) {
        free(buf);
        return NULL;
    }
    buf[len] = '\0';
    *out_len = len;
    return buf;
}

static void print_js_error(JSContext *ctx) {
    JSValue exc = JS_GetException(ctx);
    const char *msg = JS_ToCString(ctx, exc);
    fprintf(stderr, "JS error: %s\n", msg != NULL ? msg : "(unknown)");
    if (msg != NULL) {
        JS_FreeCString(ctx, msg);
    }
    JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
    if (JS_IsString(stack)) {
        const char *s = JS_ToCString(ctx, stack);
        if (s != NULL) {
            fprintf(stderr, "%s\n", s);
            JS_FreeCString(ctx, s);
        }
    }
    JS_FreeValue(ctx, stack);
    JS_FreeValue(ctx, exc);
}

static JSContext *new_context(void) {
    JSRuntime *rt = JS_NewRuntime();
    if (rt == NULL) {
        fprintf(stderr, "cannot create JS runtime\n");
        exit(2);
    }
    JS_SetMemoryLimit(rt, env_mb("STATIC_VIZ_WORKER_MEMORY_LIMIT_MB",
                                 DEFAULT_MEMORY_LIMIT_MB));
    JS_SetMaxStackSize(rt, env_mb("STATIC_VIZ_WORKER_STACK_LIMIT_MB",
                                  DEFAULT_STACK_LIMIT_MB));
    JSContext *ctx = JS_NewContext(rt);
    if (ctx == NULL) {
        fprintf(stderr, "cannot create JS context\n");
        exit(2);
    }
    return ctx;
}

static int cmd_version(void) {
    printf("quickjs-ng %s\n", JS_GetVersion());
    return 0;
}

static int cmd_compile(const char *in_path, const char *out_path) {
    JSContext *ctx = new_context();

    size_t src_len;
    char *src = read_file(in_path, &src_len);
    if (src == NULL) {
        fprintf(stderr, "cannot read %s\n", in_path);
        return 2;
    }

    JSValue compiled = JS_Eval(ctx, src, src_len, "lib-static-viz.bundle.js",
                               JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    free(src);
    if (JS_IsException(compiled)) {
        print_js_error(ctx);
        return 1;
    }

    size_t bytecode_len;
    // Keep debug info (line numbers in JS error stacks) but drop the source
    // text, which the bytecode does not need and which dominates the size.
    uint8_t *bytecode = JS_WriteObject(ctx, &bytecode_len, compiled,
                                       JS_WRITE_OBJ_BYTECODE
                                           | JS_WRITE_OBJ_STRIP_SOURCE);
    JS_FreeValue(ctx, compiled);
    if (bytecode == NULL) {
        print_js_error(ctx);
        return 1;
    }

    FILE *out = fopen(out_path, "wb");
    if (out == NULL || fwrite(bytecode, 1, bytecode_len, out) != bytecode_len ||
        fclose(out) != 0) {
        fprintf(stderr, "cannot write %s\n", out_path);
        return 2;
    }
    js_free_rt(JS_GetRuntime(ctx), bytecode);
    return 0;
}

static int eval_bundle(JSContext *ctx, const char *path) {
    size_t len;
    char *buf = read_file(path, &len);
    if (buf == NULL) {
        fprintf(stderr, "cannot read %s\n", path);
        return 2;
    }

    JSValue result;
    size_t ext_offset = strlen(path) >= 4 ? strlen(path) - 4 : 0;
    if (strcmp(path + ext_offset, ".qbc") == 0) {
        JSValue obj = JS_ReadObject(ctx, (const uint8_t *)buf, len,
                                    JS_READ_OBJ_BYTECODE);
        free(buf);
        if (JS_IsException(obj)) {
            print_js_error(ctx);
            return 1;
        }
        result = JS_EvalFunction(ctx, obj);
    } else {
        result = JS_Eval(ctx, buf, len, "lib-static-viz.bundle.js",
                         JS_EVAL_TYPE_GLOBAL);
        free(buf);
    }

    if (JS_IsException(result)) {
        print_js_error(ctx);
        return 1;
    }
    JS_FreeValue(ctx, result);
    return 0;
}

static int cmd_render(const char *bundle_path, const char *fn_name) {
    JSContext *ctx = new_context();

    int status = eval_bundle(ctx, bundle_path);
    if (status != 0) {
        return status;
    }

    size_t input_len;
    char *input = read_stdin(&input_len);
    if (input == NULL) {
        fprintf(stderr, "cannot read stdin\n");
        return 2;
    }

    JSValue global = JS_GetGlobalObject(ctx);
    JSValue ns = JS_GetPropertyStr(ctx, global, "MetabaseStaticViz");
    JSValue fn = JS_GetPropertyStr(ctx, ns, fn_name);
    JS_FreeValue(ctx, global);
    if (!JS_IsFunction(ctx, fn)) {
        fprintf(stderr, "MetabaseStaticViz.%s is not a function\n", fn_name);
        return 1;
    }

    JSValue arg = JS_NewStringLen(ctx, input, input_len);
    free(input);
    JSValue ret = JS_Call(ctx, fn, ns, 1, &arg);
    JS_FreeValue(ctx, arg);
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, ns);
    if (JS_IsException(ret)) {
        print_js_error(ctx);
        return 1;
    }

    size_t out_len;
    const char *out = JS_ToCStringLen(ctx, &out_len, ret);
    JS_FreeValue(ctx, ret);
    if (out == NULL) {
        print_js_error(ctx);
        return 1;
    }
    if (fwrite(out, 1, out_len, stdout) != out_len || fflush(stdout) != 0) {
        fprintf(stderr, "cannot write stdout\n");
        return 2;
    }
    JS_FreeCString(ctx, out);

    // The process exits immediately; skip freeing the runtime — the OS
    // reclaims everything, and a full GC pass over the bundle heap costs
    // more than it's worth on this hot path.
    return 0;
}

int main(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "version") == 0) {
        return cmd_version();
    }
    if (argc == 4 && strcmp(argv[1], "compile") == 0) {
        return cmd_compile(argv[2], argv[3]);
    }
    if (argc == 4 && strcmp(argv[1], "render") == 0) {
        return cmd_render(argv[2], argv[3]);
    }
    fprintf(stderr,
            "usage: %s version\n"
            "       %s compile <in.js> <out.qbc>\n"
            "       %s render <bundle.js|bundle.qbc> <function>\n",
            argv[0], argv[0], argv[0]);
    return 2;
}
