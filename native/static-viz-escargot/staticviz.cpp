// libstaticviz: the Escargot JS engine behind a minimal C API, loaded into
// the JVM via JNA by metabase.channel.render.js.escargot to render static
// visualizations in-process.
//
// Escargot is used for its complete, ICU-backed ECMA-402 implementation:
// charts format numbers, currencies, and timezone-aware dates through real
// Intl, so no polyfill rides along in the JS bundle. ICU is linked at build
// time on macOS and loaded from the system at runtime on Linux.
//
// One handle = one VM instance + context with the static-viz bundle
// evaluated, pinned to a dedicated engine thread: the engine (and its
// conservative GC) assumes a context lives and dies on one thread with
// stable stack bounds, which no caller-thread discipline can guarantee from
// a JVM, so svq_call posts the request to the handle's thread and waits.
// Handles serialize their calls; the caller may still hold each handle
// exclusively (the Clojure side does, via a pool) but any thread may call.
// The engine exposes only ECMAScript intrinsics plus a stderr-backed
// console — no filesystem, network, timers, or module loader.
//
// Every returned string (results and errors) is malloc'd and owned by the
// caller; release it with svq_free_string. Functions with a `char **error_out`
// parameter set it to a malloc'd message on failure (and return NULL).

#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <pthread.h>
#include <string>

#include <EscargotPublic.h>

using namespace Escargot;

#ifdef _WIN32
#define SVQ_EXPORT __declspec(dllexport)
#else
#define SVQ_EXPORT __attribute__((visibility("default")))
#endif

extern "C" {
SVQ_EXPORT const char *svq_version(void);
SVQ_EXPORT void *svq_create(const char *bundle_path, char **error_out);
SVQ_EXPORT char *svq_call(void *handle, const char *fn_name, const char *input, char **error_out);
SVQ_EXPORT void svq_free_string(char *s);
SVQ_EXPORT void svq_close(void *handle);
}

// All engine state is confined to the handle's engine thread; the request
// slot below is the only cross-thread surface.
struct svq_handle {
    pthread_t thread;
    std::mutex mutex;
    std::condition_variable cv;

    enum class Op { None, Call, Shutdown };
    Op op = Op::None;
    std::string fn_name;
    std::string input;
    std::string result;
    std::string error;
    bool completed = false;
    bool failed = false;

    std::string bundle_path;
    bool started = false;
    bool start_failed = false;
    std::string start_error;
};

static char *dup_string(const char *s) {
    size_t len = strlen(s) + 1;
    char *copy = (char *)malloc(len);
    if (copy != NULL) {
        memcpy(copy, s, len);
    }
    return copy;
}

static void set_error(char **error_out, const std::string &message) {
    if (error_out != NULL) {
        *error_out = dup_string(message.c_str());
    }
}

// Renders never load modules and job scheduling is drained synchronously
// after each call, so the platform hooks are inert.
class StaticVizPlatform : public PlatformRef {
public:
    void markJSJobEnqueued(ContextRef *) override {}
    void markJSJobFromAnotherThreadExists(ContextRef *) override {}
    LoadModuleResult onLoadModule(ContextRef *, ScriptRef *, StringRef *, ModuleType) override {
        return LoadModuleResult(ErrorObjectRef::Code::TypeError,
                                StringRef::createFromASCII("modules are not supported"));
    }
    void didLoadModule(ContextRef *, OptionalRef<ScriptRef>, ScriptRef *) override {}
};

// Escargot requires each thread to be registered with the GC before it
// touches the engine: `Globals::initialize` covers the process AND the
// calling thread, and every other engine thread brackets its life with
// `initializeThread`/`finalizeThread`. Only handle-owned engine threads
// ever touch the engine.
static bool engine_thread_register() {
    static std::once_flag once;
    bool ran_global_init = false;
    std::call_once(once, [&]() {
        Globals::initialize(new StaticVizPlatform());
        ran_global_init = true;
    });
    if (!ran_global_init) {
        Globals::initializeThread();
    }
    return true;
}

static ValueRef *js_console_write(ExecutionStateRef *state, ValueRef *, size_t argc, ValueRef **argv, bool) {
    for (size_t i = 0; i < argc; i++) {
        StringRef *s = argv[i]->toStringWithoutException(state->context());
        fprintf(stderr, "%s%s", i > 0 ? " " : "", s->toStdUTF8String().data());
    }
    fputc('\n', stderr);
    return ValueRef::createUndefined();
}

// console.* for the bundle's diagnostics: chart code logs warnings (and logs
// errors it caught) through it. Mirrors the GraalVM renderer, which wires
// console to the JVM's stderr.
static void add_console(ContextRef *context) {
    Evaluator::execute(context, [](ExecutionStateRef *state) -> ValueRef * {
        ContextRef *context = state->context();
        ObjectRef *console = ObjectRef::create(state);
        static const char *levels[] = {"log", "info", "warn", "error", "debug", "trace"};
        for (const char *level : levels) {
            FunctionObjectRef::NativeFunctionInfo info(
                AtomicStringRef::create(context, level, strlen(level)), js_console_write, 1, true, false);
            console->set(state, StringRef::createFromASCII(level, strlen(level)), FunctionObjectRef::create(state, info));
        }
        context->globalObject()->set(state, StringRef::createFromASCII("console"), console);
        return ValueRef::createUndefined();
    });
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
    char *buf = (char *)malloc((size_t)len + 1);
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

static std::string evaluator_error(ContextRef *context, const Evaluator::EvaluatorResult &result) {
    std::string message = result.resultOrErrorToString(context)->toStdUTF8String();
    for (size_t i = 0; i < result.stackTrace.size() && i < 8; i++) {
        message += "\n    at ";
        message += result.stackTrace[i].srcName->toStdUTF8String();
        message += " (" + std::to_string(result.stackTrace[i].loc.line) + ":"
                   + std::to_string(result.stackTrace[i].loc.column) + ")";
    }
    return message;
}

static void drain_pending_jobs(ContextRef *context) {
    while (context->vmInstance()->hasPendingJob()) {
        context->vmInstance()->executePendingJob();
    }
}

const char *svq_version(void) {
    static char version[64];
    snprintf(version, sizeof(version), "escargot %s", Globals::version());
    return version;
}

void *svq_create(const char *bundle_path, char **error_out);

// Runs on the handle's engine thread: create the VM, evaluate the bundle,
// then serve call requests until shutdown. Everything the engine sees —
// creation, execution, collection, destruction — happens on this thread,
// with the 8MB stack the engine's parser and the charts' recursion need.
static void *engine_thread_main(void *arg) {
    svq_handle *h = (svq_handle *)arg;
    engine_thread_register();

    {
        PersistentRefHolder<VMInstanceRef> vm = VMInstanceRef::create();
        PersistentRefHolder<ContextRef> context = ContextRef::create(vm.get());
        add_console(context.get());

        bool ready = false;
        {
            size_t source_len;
            char *source = read_file(h->bundle_path.c_str(), &source_len);
            if (source == NULL) {
                std::lock_guard<std::mutex> lock(h->mutex);
                h->start_failed = true;
                h->start_error = "cannot read static-viz bundle";
            } else {
                StringRef *source_ref = StringRef::createFromUTF8(source, source_len);
                free(source);
                StringRef *name_ref = StringRef::createFromASCII("lib-static-viz.bundle.js");
                auto parsed = context->scriptParser()->initializeScript(source_ref, name_ref, false);
                if (!parsed.script) {
                    std::lock_guard<std::mutex> lock(h->mutex);
                    h->start_failed = true;
                    h->start_error = "bundle parse error: " + parsed.parseErrorMessage->toStdUTF8String();
                } else {
                    auto result = Evaluator::execute(
                        context.get(),
                        [](ExecutionStateRef *state, ScriptRef *script) -> ValueRef * {
                            return script->execute(state);
                        },
                        parsed.script.get());
                    if (!result.isSuccessful()) {
                        std::lock_guard<std::mutex> lock(h->mutex);
                        h->start_failed = true;
                        h->start_error = evaluator_error(context.get(), result);
                    } else {
                        drain_pending_jobs(context.get());
                        ready = true;
                    }
                }
            }
        }
        {
            std::lock_guard<std::mutex> lock(h->mutex);
            h->started = true;
        }
        h->cv.notify_all();

        while (ready) {
            std::unique_lock<std::mutex> lock(h->mutex);
            h->cv.wait(lock, [h] { return h->op != svq_handle::Op::None; });
            if (h->op == svq_handle::Op::Shutdown) {
                break;
            }
            std::string fn_name = h->fn_name;
            std::string input = h->input;
            lock.unlock();

            StringRef *fn_ref = StringRef::createFromUTF8(fn_name.c_str(), fn_name.size());
            StringRef *input_ref = StringRef::createFromUTF8(input.c_str(), input.size());
            auto result = Evaluator::execute(
                context.get(),
                [](ExecutionStateRef *state, StringRef *fn_name, StringRef *input) -> ValueRef * {
                    ObjectRef *global = state->context()->globalObject();
                    ValueRef *ns = global->get(state, StringRef::createFromASCII("MetabaseStaticViz"));
                    if (!ns->isObject()) {
                        state->throwException(ErrorObjectRef::create(
                            state, ErrorObjectRef::Code::TypeError,
                            StringRef::createFromASCII("MetabaseStaticViz is not defined")));
                    }
                    ValueRef *fn = ns->asObject()->get(state, fn_name);
                    if (!fn->isCallable()) {
                        state->throwException(ErrorObjectRef::create(
                            state, ErrorObjectRef::Code::TypeError,
                            StringRef::createFromASCII("not a MetabaseStaticViz function")));
                    }
                    ValueRef *argv[1] = {input};
                    return fn->call(state, ns, 1, argv)->toString(state);
                },
                fn_ref, input_ref);
            drain_pending_jobs(context.get());

            lock.lock();
            if (result.isSuccessful()) {
                h->result = result.result->asString()->toStdUTF8String();
                h->failed = false;
            } else {
                h->error = evaluator_error(context.get(), result);
                h->failed = true;
            }
            h->op = svq_handle::Op::None;
            h->completed = true;
            lock.unlock();
            h->cv.notify_all();
        }
        // PersistentRefHolders release here, on the engine thread.
    }
    Memory::gc();
    Globals::finalizeThread();
    return NULL;
}

void *svq_create(const char *bundle_path, char **error_out) {
    svq_handle *h = new svq_handle();
    h->bundle_path = bundle_path;

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, 8 << 20);
    if (pthread_create(&h->thread, &attr, engine_thread_main, h) != 0) {
        set_error(error_out, "cannot start engine thread");
        delete h;
        return NULL;
    }

    std::unique_lock<std::mutex> lock(h->mutex);
    h->cv.wait(lock, [h] { return h->started; });
    if (h->start_failed) {
        std::string message = h->start_error;
        lock.unlock();
        pthread_join(h->thread, NULL);
        delete h;
        set_error(error_out, message);
        return NULL;
    }
    return h;
}

char *svq_call(void *handle, const char *fn_name, const char *input, char **error_out) {
    svq_handle *h = (svq_handle *)handle;

    std::unique_lock<std::mutex> lock(h->mutex);
    h->fn_name = fn_name;
    h->input = input;
    h->completed = false;
    h->op = svq_handle::Op::Call;
    h->cv.notify_all();
    h->cv.wait(lock, [h] { return h->completed; });

    if (h->failed) {
        set_error(error_out, h->error);
        return NULL;
    }
    return dup_string(h->result.c_str());
}

void svq_free_string(char *s) {
    free(s);
}

void svq_close(void *handle) {
    svq_handle *h = (svq_handle *)handle;
    if (h == NULL) {
        return;
    }
    {
        std::lock_guard<std::mutex> lock(h->mutex);
        h->op = svq_handle::Op::Shutdown;
    }
    h->cv.notify_all();
    pthread_join(h->thread, NULL);
    delete h;
}
