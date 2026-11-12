import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotException;
import org.graalvm.polyglot.SandboxPolicy;

/**
 * Smoke test for a rebuilt polyglot isolate, run by the `test` stage of the Dockerfile next to this file. Builds an
 * engine and contexts the way src/metabase/channel/render/js/graal.clj does and fails (non-zero exit) unless the
 * isolate loaded from the directory given as the only argument, evaluates JS, and enforces the sandbox limits.
 *
 * Usage: java -Dpolyglot.engine.resourcePath.engine.js-isolate-linux-<arch>=DIR -cp 'lib/*' IsolateSmokeTest.java DIR
 */
public class IsolateSmokeTest {

    public static void main(String[] args) throws Exception {
        Path expectedDir = Path.of(args[0]).toRealPath();
        try (Engine engine = Engine.newBuilder("js")
                                   .sandbox(SandboxPolicy.UNTRUSTED)
                                   .option("engine.MaxIsolateMemory", "512MB")
                                   .out(OutputStream.nullOutputStream())
                                   .err(OutputStream.nullOutputStream())
                                   .build()) {
            String loaded = Files.readAllLines(Path.of("/proc/self/maps")).stream()
                                 .filter(line -> line.endsWith("/libpolyglotisolate.so"))
                                 .map(line -> line.substring(line.indexOf('/')))
                                 .findFirst()
                                 .orElseThrow(() -> new AssertionError("no libpolyglotisolate.so is mapped"));
            check(Path.of(loaded).getParent().equals(expectedDir), "isolate loaded from " + loaded + ", expected " + expectedDir);

            try (Context context = context(engine, "30s", "416MB")) {
                check(context.eval("js", "1 + 2").asInt() == 3, "1 + 2");
                check(context.eval("js", "JSON.stringify({a: [1, 'x'.repeat(2)]})").asString().equals("{\"a\":[1,\"xx\"]}"), "JSON");
                String berlin = context.eval("js", "new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23'})"
                                                   + ".format(new Date(Date.UTC(2024, 0, 1, 12)))").asString();
                check(berlin.equals("13"), "Intl time zone, got " + berlin);
            }

            expectLimit(engine, "30s", "const a = []; while (true) { a.push(new Array(1e6).fill(1)); }", "heap memory");
            expectLimit(engine, "2s", "while (true) {}", "CPU time");
            System.out.println("isolate OK: " + loaded + " (" + engine.getImplementationName() + " " + engine.getVersion() + ")");
        }
    }

    static Context context(Engine engine, String maxCpuTime, String maxHeapMemory) {
        return Context.newBuilder("js")
                      .engine(engine)
                      .sandbox(SandboxPolicy.UNTRUSTED)
                      .allowHostAccess(HostAccess.UNTRUSTED)
                      .option("sandbox.MaxCPUTime", maxCpuTime)
                      .option("sandbox.MaxHeapMemory", maxHeapMemory)
                      .option("sandbox.MaxASTDepth", "5000")
                      .option("sandbox.MaxThreads", "1")
                      .option("sandbox.MaxOutputStreamSize", "16MB")
                      .option("sandbox.MaxErrorStreamSize", "4MB")
                      .build();
    }

    static void expectLimit(Engine engine, String maxCpuTime, String source, String limit) {
        Context context = context(engine, maxCpuTime, "64MB");
        try {
            context.eval("js", source);
            throw new AssertionError(limit + " limit was not enforced");
        } catch (PolyglotException e) {
            check((e.isResourceExhausted() || e.isCancelled()) && e.getMessage().toLowerCase().contains(limit.toLowerCase()),
                  limit + " limit: unexpected " + e);
        } finally {
            try {
                context.close(true);
            } catch (PolyglotException e) {
                // a context stopped by a sandbox limit rethrows that on close
            }
        }
    }

    static void check(boolean ok, String what) {
        if (!ok) {
            throw new AssertionError("check failed: " + what);
        }
    }
}
