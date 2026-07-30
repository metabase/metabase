// libstaticviz: QuickJS embedded behind a minimal C API, loaded into the JVM
// via JNA by metabase.channel.render.js.quickjs to render static visualizations
// in-process.
//
// One handle = one QuickJS runtime + context with the static-viz bundle
// evaluated. Handles are NOT thread-safe: the caller must guarantee a handle
// is used by at most one thread at a time (the Clojure side holds each handle
// exclusively via a pool). All memory the engine allocates is plain malloc —
// native memory, invisible to the JVM heap and GC — and JS heap/stack limits
// are set per runtime. The engine gets no filesystem, network, timer, or
// module access: only ECMAScript intrinsics plus what the bundle defines.
//
// Every returned string (results and errors) is malloc'd and owned by the
// caller; release it with svq_free_string. Functions with a `char **error_out`
// parameter set it to a malloc'd message on failure (and return NULL / nonzero).

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

#ifdef _WIN32
#define SVQ_EXPORT __declspec(dllexport)
#else
#define SVQ_EXPORT __attribute__((visibility("default")))
#endif

typedef struct svq_handle {
    JSRuntime *rt;
    JSContext *ctx;
    // Wall-clock deadline for the currently executing call, in milliseconds
    // since the monotonic epoch; 0 when no deadline is armed. Checked by the
    // engine's interrupt handler.
    int64_t deadline_ms;
    // Set when the interrupt handler fired, so a resulting "interrupted"
    // exception can be reported as a timeout rather than a script error.
    int timed_out;
} svq_handle;

static int64_t now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static char *dup_string(const char *s) {
    size_t len = strlen(s) + 1;
    char *copy = malloc(len);
    if (copy != NULL) {
        memcpy(copy, s, len);
    }
    return copy;
}

static void set_error(char **error_out, const char *message) {
    if (error_out != NULL) {
        *error_out = dup_string(message);
    }
}

// Format the pending JS exception (message + stack when present) into a
// malloc'd string and clear it from the context.
static void set_js_error(JSContext *ctx, char **error_out) {
    JSValue exc = JS_GetException(ctx);
    const char *msg = JS_ToCString(ctx, exc);
    JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
    const char *stack_str = JS_IsString(stack) ? JS_ToCString(ctx, stack) : NULL;

    const char *msg_part = msg != NULL ? msg : "(unknown JS error)";
    const char *stack_part = stack_str != NULL ? stack_str : "";
    size_t len = strlen(msg_part) + strlen(stack_part) + 2;
    char *buf = malloc(len + 1);
    if (buf != NULL) {
        snprintf(buf, len + 1, "%s%s%s", msg_part, *stack_part != '\0' ? "\n" : "", stack_part);
    }
    if (error_out != NULL) {
        *error_out = buf;
    } else {
        free(buf);
    }

    if (stack_str != NULL) {
        JS_FreeCString(ctx, stack_str);
    }
    JS_FreeValue(ctx, stack);
    if (msg != NULL) {
        JS_FreeCString(ctx, msg);
    }
    JS_FreeValue(ctx, exc);
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

static int has_extension(const char *path, const char *ext) {
    size_t path_len = strlen(path);
    size_t ext_len = strlen(ext);
    return path_len >= ext_len && strcmp(path + path_len - ext_len, ext) == 0;
}

static int interrupt_handler(JSRuntime *rt, void *opaque) {
    svq_handle *h = opaque;
    if (h->deadline_ms != 0 && now_ms() > h->deadline_ms) {
        h->timed_out = 1;
        return 1;
    }
    return 0;
}

// console.* for the bundle's diagnostics: a bare QuickJS context has no
// console, but chart code logs warnings (and logs errors it caught) through
// it. Mirrors the GraalVM renderer, which wires console to the JVM's stderr.
static JSValue js_console_write(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    (void)this_val;
    for (int i = 0; i < argc; i++) {
        const char *s = JS_ToCString(ctx, argv[i]);
        fprintf(stderr, "%s%s", i > 0 ? " " : "", s != NULL ? s : "(unprintable)");
        if (s != NULL) {
            JS_FreeCString(ctx, s);
        }
    }
    fputc('\n', stderr);
    return JS_UNDEFINED;
}

static void add_console(JSContext *ctx) {
    static const char *levels[] = {"log", "info", "warn", "error", "debug", "trace"};
    JSValue console = JS_NewObject(ctx);
    for (size_t i = 0; i < sizeof(levels) / sizeof(levels[0]); i++) {
        JS_SetPropertyStr(ctx, console, levels[i],
                          JS_NewCFunction(ctx, js_console_write, levels[i], 1));
    }
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "console", console);
    JS_FreeValue(ctx, global);
}

static svq_handle *new_handle(int memory_limit_mb, int stack_limit_mb) {
    JSRuntime *rt = JS_NewRuntime();
    if (rt == NULL) {
        return NULL;
    }
    JS_SetMemoryLimit(rt, (size_t)memory_limit_mb * 1024 * 1024);
    JS_SetMaxStackSize(rt, (size_t)stack_limit_mb * 1024 * 1024);
    JSContext *ctx = JS_NewContext(rt);
    if (ctx == NULL) {
        JS_FreeRuntime(rt);
        return NULL;
    }
    svq_handle *h = calloc(1, sizeof(svq_handle));
    if (h == NULL) {
        JS_FreeContext(ctx);
        JS_FreeRuntime(rt);
        return NULL;
    }
    h->rt = rt;
    h->ctx = ctx;
    JS_SetInterruptHandler(rt, interrupt_handler, h);
    add_console(ctx);
    return h;
}

// Evaluate the bundle (source `.js`, or `.qbc` bytecode produced by
// svq_compile with the same library build) into the handle's context.
static int eval_bundle(svq_handle *h, const char *bundle_path, char **error_out) {
    size_t len;
    char *buf = read_file(bundle_path, &len);
    if (buf == NULL) {
        set_error(error_out, "cannot read static-viz bundle");
        return -1;
    }

    JSValue result;
    if (has_extension(bundle_path, ".qbc")) {
        JSValue obj = JS_ReadObject(h->ctx, (const uint8_t *)buf, len, JS_READ_OBJ_BYTECODE);
        free(buf);
        if (JS_IsException(obj)) {
            set_js_error(h->ctx, error_out);
            return -1;
        }
        result = JS_EvalFunction(h->ctx, obj);
    } else {
        result = JS_Eval(h->ctx, buf, len, "lib-static-viz.bundle.js", JS_EVAL_TYPE_GLOBAL);
        free(buf);
    }

    if (JS_IsException(result)) {
        set_js_error(h->ctx, error_out);
        return -1;
    }
    JS_FreeValue(h->ctx, result);
    return 0;
}

SVQ_EXPORT void svq_close(void *handle);

SVQ_EXPORT const char *svq_version(void) {
    static char version[64];
    snprintf(version, sizeof(version), "quickjs-ng %s", JS_GetVersion());
    return version;
}

SVQ_EXPORT void *svq_create(const char *bundle_path,
                            int memory_limit_mb,
                            int stack_limit_mb,
                            char **error_out) {
    svq_handle *h = new_handle(memory_limit_mb, stack_limit_mb);
    if (h == NULL) {
        set_error(error_out, "cannot create QuickJS runtime");
        return NULL;
    }
    if (eval_bundle(h, bundle_path, error_out) != 0) {
        svq_close(h);
        return NULL;
    }
    return h;
}

SVQ_EXPORT char *svq_call(void *handle,
                          const char *fn_name,
                          const char *input,
                          int timeout_ms,
                          char **error_out) {
    svq_handle *h = handle;
    JSContext *ctx = h->ctx;

    // A pooled handle may be driven by a different thread on every call; the
    // engine's stack-overflow check is relative to the current thread's stack.
    JS_UpdateStackTop(h->rt);

    JSValue global = JS_GetGlobalObject(ctx);
    JSValue ns = JS_GetPropertyStr(ctx, global, "MetabaseStaticViz");
    JSValue fn = JS_GetPropertyStr(ctx, ns, fn_name);
    JS_FreeValue(ctx, global);
    if (!JS_IsFunction(ctx, fn)) {
        JS_FreeValue(ctx, fn);
        JS_FreeValue(ctx, ns);
        set_error(error_out, "not a MetabaseStaticViz function");
        return NULL;
    }

    h->timed_out = 0;
    h->deadline_ms = timeout_ms > 0 ? now_ms() + timeout_ms : 0;
    JSValue arg = JS_NewString(ctx, input);
    JSValue ret = JS_Call(ctx, fn, ns, 1, &arg);
    h->deadline_ms = 0;
    JS_FreeValue(ctx, arg);
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, ns);

    if (JS_IsException(ret)) {
        if (h->timed_out) {
            JSValue exc = JS_GetException(ctx);
            JS_FreeValue(ctx, exc);
            set_error(error_out, "TIMEOUT");
        } else {
            set_js_error(ctx, error_out);
        }
        return NULL;
    }

    const char *result = JS_ToCString(ctx, ret);
    JS_FreeValue(ctx, ret);
    if (result == NULL) {
        set_js_error(ctx, error_out);
        return NULL;
    }
    char *copy = dup_string(result);
    JS_FreeCString(ctx, result);

    // Renders churn tens of MB of temporaries; collect while the context is
    // idle so the retained native heap between calls stays close to the
    // bundle's baseline.
    JS_RunGC(h->rt);
    return copy;
}

SVQ_EXPORT int svq_compile(const char *in_path,
                           const char *out_path,
                           int memory_limit_mb,
                           char **error_out) {
    svq_handle *h = new_handle(memory_limit_mb, 8);
    if (h == NULL) {
        set_error(error_out, "cannot create QuickJS runtime");
        return -1;
    }

    int status = -1;
    size_t src_len;
    char *src = read_file(in_path, &src_len);
    if (src == NULL) {
        set_error(error_out, "cannot read compile input");
        goto done;
    }

    JSValue compiled = JS_Eval(h->ctx, src, src_len, "lib-static-viz.bundle.js",
                               JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    free(src);
    if (JS_IsException(compiled)) {
        set_js_error(h->ctx, error_out);
        goto done;
    }

    // Keep debug info (line numbers in JS error stacks) but drop the source
    // text, which the bytecode does not need and which dominates the size.
    size_t bytecode_len;
    uint8_t *bytecode = JS_WriteObject(h->ctx, &bytecode_len, compiled,
                                       JS_WRITE_OBJ_BYTECODE | JS_WRITE_OBJ_STRIP_SOURCE);
    JS_FreeValue(h->ctx, compiled);
    if (bytecode == NULL) {
        set_js_error(h->ctx, error_out);
        goto done;
    }

    FILE *out = fopen(out_path, "wb");
    if (out == NULL || fwrite(bytecode, 1, bytecode_len, out) != bytecode_len || fclose(out) != 0) {
        set_error(error_out, "cannot write compile output");
        js_free_rt(h->rt, bytecode);
        goto done;
    }
    js_free_rt(h->rt, bytecode);
    status = 0;

done:
    svq_close(h);
    return status;
}

SVQ_EXPORT void svq_free_string(char *s) {
    free(s);
}

SVQ_EXPORT void svq_close(void *handle) {
    svq_handle *h = handle;
    if (h == NULL) {
        return;
    }
    JS_FreeContext(h->ctx);
    JS_FreeRuntime(h->rt);
    free(h);
}
