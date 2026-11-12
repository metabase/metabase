import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotException;
import org.graalvm.polyglot.SandboxPolicy;

/**
 * Smoke test for the isolate, run by the `test` stage of the Dockerfile next to this file: the isolate must load from
 * the directory given as the only argument, evaluate JS with ICU data, and enforce a sandbox limit.
 */
public class IsolateSmokeTest {

    public static void main(String[] args) throws Exception {
        Path expectedDir = Path.of(args[0]).toRealPath();
        try (Engine engine = Engine.newBuilder("js")
                                   .sandbox(SandboxPolicy.UNTRUSTED)
                                   .option("engine.MaxIsolateMemory", "256MB")
                                   .out(OutputStream.nullOutputStream())
                                   .err(OutputStream.nullOutputStream())
                                   .build()) {
            String loaded = Files.readAllLines(Path.of("/proc/self/maps")).stream()
                                 .filter(line -> line.endsWith("/libpolyglotisolate.so"))
                                 .map(line -> line.substring(line.indexOf('/')))
                                 .findFirst()
                                 .orElseThrow(() -> new AssertionError("no libpolyglotisolate.so is mapped"));
            check(Path.of(loaded).getParent().equals(expectedDir), "isolate loaded from " + loaded);

            try (Context context = context(engine, "30s")) {
                String hour = context.eval("js", "new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23'})"
                                                 + ".format(new Date(Date.UTC(2024, 0, 1, 12)))").asString();
                check(hour.equals("13"), "Intl time zone, got " + hour);
            }

            Context context = context(engine, "2s");
            try {
                context.eval("js", "while (true) {}");
                throw new AssertionError("CPU time limit was not enforced");
            } catch (PolyglotException e) {
                check(e.isResourceExhausted() || e.isCancelled(), "CPU time limit: unexpected " + e);
            } finally {
                try {
                    context.close(true);
                } catch (PolyglotException e) {
                    // a context stopped by a sandbox limit rethrows that on close
                }
            }
            System.out.println("isolate OK: " + loaded + " (" + engine.getVersion() + ")");
        }
    }

    /** UNTRUSTED requires every one of these limits. */
    static Context context(Engine engine, String maxCpuTime) {
        return Context.newBuilder("js")
                      .engine(engine)
                      .sandbox(SandboxPolicy.UNTRUSTED)
                      .allowHostAccess(HostAccess.UNTRUSTED)
                      .option("sandbox.MaxCPUTime", maxCpuTime)
                      .option("sandbox.MaxHeapMemory", "64MB")
                      .option("sandbox.MaxASTDepth", "1000")
                      .option("sandbox.MaxThreads", "1")
                      .option("sandbox.MaxOutputStreamSize", "1MB")
                      .option("sandbox.MaxErrorStreamSize", "1MB")
                      .build();
    }

    static void check(boolean ok, String what) {
        if (!ok) {
            throw new AssertionError("check failed: " + what);
        }
    }
}
