// Sanity check for a freshly built libstaticviz: dlopen it the way the JVM
// (via JNA) will, exercise the whole svq_* surface against a stub bundle, and
// exit nonzero on any deviation. Run by build.sh and CI.

#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef const char *(*version_fn)(void);
typedef void *(*create_fn)(const char *, int, int, char **);
typedef char *(*call_fn)(void *, const char *, const char *, int, char **);
typedef int (*compile_fn)(const char *, const char *, int, char **);
typedef void (*free_string_fn)(char *);
typedef void (*close_fn)(void *);

#define STUB_BUNDLE \
    "var MetabaseStaticViz = {" \
    "  echo: (s) => { console.warn('echoing', s); return s; }," \
    "  boom: () => { throw new Error('boom'); }," \
    "  spin: () => { while (true) {} }" \
    "};"

static int failures = 0;

static void expect(int condition, const char *what) {
    if (!condition) {
        fprintf(stderr, "FAIL: %s\n", what);
        failures++;
    }
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s <libstaticviz path>\n", argv[0]);
        return 2;
    }

    void *lib = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (lib == NULL) {
        fprintf(stderr, "dlopen failed: %s\n", dlerror());
        return 2;
    }
    version_fn svq_version = (version_fn)dlsym(lib, "svq_version");
    create_fn svq_create = (create_fn)dlsym(lib, "svq_create");
    call_fn svq_call = (call_fn)dlsym(lib, "svq_call");
    compile_fn svq_compile = (compile_fn)dlsym(lib, "svq_compile");
    free_string_fn svq_free_string = (free_string_fn)dlsym(lib, "svq_free_string");
    close_fn svq_close = (close_fn)dlsym(lib, "svq_close");
    if (!svq_version || !svq_create || !svq_call || !svq_compile || !svq_free_string || !svq_close) {
        fprintf(stderr, "missing svq_* exports\n");
        return 2;
    }

    printf("%s\n", svq_version());

    char js_path[] = "/tmp/svq-smoke-XXXXXX.js";
    char qbc_path[] = "/tmp/svq-smoke-XXXXXX.qbc";
    FILE *f = fopen(js_path, "w");
    fputs(STUB_BUNDLE, f);
    fclose(f);

    char *error = NULL;

    expect(svq_compile(js_path, qbc_path, 64, &error) == 0, "compile succeeds");

    void *handle = svq_create(qbc_path, 64, 8, &error);
    expect(handle != NULL, "create from bytecode succeeds");
    if (handle == NULL) {
        fprintf(stderr, "create error: %s\n", error ? error : "(none)");
        return 1;
    }

    char *result = svq_call(handle, "echo", "hello", 1000, &error);
    expect(result != NULL && strcmp(result, "hello") == 0, "echo returns its input");
    svq_free_string(result);

    error = NULL;
    result = svq_call(handle, "boom", "", 1000, &error);
    expect(result == NULL && error != NULL && strstr(error, "boom") != NULL,
           "a throwing function reports its JS error");
    svq_free_string(error);

    error = NULL;
    result = svq_call(handle, "spin", "", 100, &error);
    expect(result == NULL && error != NULL && strcmp(error, "TIMEOUT") == 0,
           "an infinite loop is interrupted as TIMEOUT");
    svq_free_string(error);

    error = NULL;
    result = svq_call(handle, "echo", "still alive", 1000, &error);
    expect(result != NULL && strcmp(result, "still alive") == 0,
           "the handle still works after error and timeout");
    svq_free_string(result);

    svq_close(handle);
    remove(js_path);
    remove(qbc_path);

    if (failures == 0) {
        printf("smoke test passed\n");
        return 0;
    }
    return 1;
}
