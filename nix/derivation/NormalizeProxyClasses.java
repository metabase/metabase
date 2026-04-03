import org.objectweb.asm.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Normalize Clojure proxy .class files for reproducible builds.
 *
 * Clojure's {@code proxy} macro generates proxy classes whose constructor
 * order depends on {@code Class.getConstructors()}, which the JDK spec
 * says may return constructors in any order. This produces non-deterministic
 * bytecode (different method ordering AND different constant pool layout).
 *
 * This tool uses ASM to read each proxy class and rewrite it with methods
 * sorted by (name, descriptor). ASM's ClassWriter naturally rebuilds the
 * constant pool in visitation order, producing identical output regardless
 * of the original ordering.
 *
 * Usage: java -cp asm.jar:. NormalizeProxyClasses <directory>
 */
public class NormalizeProxyClasses {

    /** Captured method: everything ASM tells us about one method. */
    static final class CapturedMethod {
        final int access;
        final String name;
        final String descriptor;
        final String signature;
        final String[] exceptions;
        final List<Object[]> events = new ArrayList<>();

        CapturedMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
            this.access = access;
            this.name = name;
            this.descriptor = descriptor;
            this.signature = signature;
            this.exceptions = exceptions;
        }

        String sortKey() { return name + descriptor; }

        /** Replay all recorded visitor events into the given MethodVisitor. */
        void replayInto(MethodVisitor mv) {
            for (Object[] ev : events) {
                String kind = (String) ev[0];
                switch (kind) {
                    case "code" -> mv.visitCode();
                    case "insn" -> mv.visitInsn((int) ev[1]);
                    case "intInsn" -> mv.visitIntInsn((int) ev[1], (int) ev[2]);
                    case "varInsn" -> mv.visitVarInsn((int) ev[1], (int) ev[2]);
                    case "typeInsn" -> mv.visitTypeInsn((int) ev[1], (String) ev[2]);
                    case "fieldInsn" -> mv.visitFieldInsn((int) ev[1], (String) ev[2], (String) ev[3], (String) ev[4]);
                    case "methodInsn" -> mv.visitMethodInsn((int) ev[1], (String) ev[2], (String) ev[3], (String) ev[4], (boolean) ev[5]);
                    case "invokeDynamic" -> mv.visitInvokeDynamicInsn((String) ev[1], (String) ev[2], (Handle) ev[3], (Object[]) ev[4]);
                    case "jumpInsn" -> mv.visitJumpInsn((int) ev[1], (Label) ev[2]);
                    case "label" -> mv.visitLabel((Label) ev[1]);
                    case "ldc" -> mv.visitLdcInsn(ev[1]);
                    case "iinc" -> mv.visitIincInsn((int) ev[1], (int) ev[2]);
                    case "tableSwitch" -> mv.visitTableSwitchInsn((int) ev[1], (int) ev[2], (Label) ev[3], (Label[]) ev[4]);
                    case "lookupSwitch" -> mv.visitLookupSwitchInsn((Label) ev[1], (int[]) ev[2], (Label[]) ev[3]);
                    case "multiANewArray" -> mv.visitMultiANewArrayInsn((String) ev[1], (int) ev[2]);
                    case "tryCatch" -> mv.visitTryCatchBlock((Label) ev[1], (Label) ev[2], (Label) ev[3], (String) ev[4]);
                    case "localVar" -> mv.visitLocalVariable((String) ev[1], (String) ev[2], (String) ev[3], (Label) ev[4], (Label) ev[5], (int) ev[6]);
                    case "maxs" -> mv.visitMaxs((int) ev[1], (int) ev[2]);
                    case "frame" -> mv.visitFrame((int) ev[1], (int) ev[2], (Object[]) ev[3], (int) ev[4], (Object[]) ev[5]);
                    case "lineNumber" -> mv.visitLineNumber((int) ev[1], (Label) ev[2]);
                    case "parameter" -> mv.visitParameter((String) ev[1], (int) ev[2]);
                    case "end" -> mv.visitEnd();
                }
            }
        }
    }

    /** Record all visitor callbacks for one method. */
    static MethodVisitor recordingVisitor(CapturedMethod cm) {
        return new MethodVisitor(Opcodes.ASM9) {
            @Override public void visitCode() { cm.events.add(new Object[]{"code"}); }
            @Override public void visitInsn(int op) { cm.events.add(new Object[]{"insn", op}); }
            @Override public void visitIntInsn(int op, int operand) { cm.events.add(new Object[]{"intInsn", op, operand}); }
            @Override public void visitVarInsn(int op, int var) { cm.events.add(new Object[]{"varInsn", op, var}); }
            @Override public void visitTypeInsn(int op, String type) { cm.events.add(new Object[]{"typeInsn", op, type}); }
            @Override public void visitFieldInsn(int op, String owner, String name, String desc) { cm.events.add(new Object[]{"fieldInsn", op, owner, name, desc}); }
            @Override public void visitMethodInsn(int op, String owner, String name, String desc, boolean itf) { cm.events.add(new Object[]{"methodInsn", op, owner, name, desc, itf}); }
            @Override public void visitInvokeDynamicInsn(String name, String desc, Handle bsm, Object... args) { cm.events.add(new Object[]{"invokeDynamic", name, desc, bsm, args}); }
            @Override public void visitJumpInsn(int op, Label label) { cm.events.add(new Object[]{"jumpInsn", op, label}); }
            @Override public void visitLabel(Label label) { cm.events.add(new Object[]{"label", label}); }
            @Override public void visitLdcInsn(Object value) { cm.events.add(new Object[]{"ldc", value}); }
            @Override public void visitIincInsn(int var, int inc) { cm.events.add(new Object[]{"iinc", var, inc}); }
            @Override public void visitTableSwitchInsn(int min, int max, Label dflt, Label... labels) { cm.events.add(new Object[]{"tableSwitch", min, max, dflt, labels}); }
            @Override public void visitLookupSwitchInsn(Label dflt, int[] keys, Label[] labels) { cm.events.add(new Object[]{"lookupSwitch", dflt, keys, labels}); }
            @Override public void visitMultiANewArrayInsn(String desc, int dims) { cm.events.add(new Object[]{"multiANewArray", desc, dims}); }
            @Override public void visitTryCatchBlock(Label start, Label end, Label handler, String type) { cm.events.add(new Object[]{"tryCatch", start, end, handler, type}); }
            @Override public void visitLocalVariable(String name, String desc, String sig, Label start, Label end, int index) { cm.events.add(new Object[]{"localVar", name, desc, sig, start, end, index}); }
            @Override public void visitMaxs(int maxStack, int maxLocals) { cm.events.add(new Object[]{"maxs", maxStack, maxLocals}); }
            @Override public void visitFrame(int type, int nLocal, Object[] local, int nStack, Object[] stack) { cm.events.add(new Object[]{"frame", type, nLocal, local, nStack, stack}); }
            @Override public void visitLineNumber(int line, Label start) { cm.events.add(new Object[]{"lineNumber", line, start}); }
            @Override public void visitParameter(String name, int access) { cm.events.add(new Object[]{"parameter", name, access}); }
            @Override public void visitEnd() { cm.events.add(new Object[]{"end"}); }
        };
    }

    static byte[] normalize(byte[] classBytes) {
        ClassReader reader = new ClassReader(classBytes);

        // Pass 1: capture all methods (EXPAND_FRAMES for COMPUTE_FRAMES compatibility)
        List<CapturedMethod> methods = new ArrayList<>();
        reader.accept(new ClassVisitor(Opcodes.ASM9) {
            @Override
            public MethodVisitor visitMethod(int access, String name, String descriptor,
                                             String signature, String[] exceptions) {
                CapturedMethod cm = new CapturedMethod(access, name, descriptor, signature, exceptions);
                methods.add(cm);
                return recordingVisitor(cm);
            }
        }, ClassReader.EXPAND_FRAMES);

        // Check if already sorted
        List<CapturedMethod> sorted = new ArrayList<>(methods);
        sorted.sort(Comparator.comparing(CapturedMethod::sortKey));
        boolean alreadySorted = true;
        for (int i = 0; i < methods.size(); i++) {
            if (!methods.get(i).sortKey().equals(sorted.get(i).sortKey())) {
                alreadySorted = false;
                break;
            }
        }
        if (alreadySorted) return classBytes;

        // Pass 2: rewrite class with methods in sorted order
        // Use COMPUTE_FRAMES so ASM recalculates stack map frames for the
        // reordered methods.  Override getCommonSuperClass to avoid needing
        // all referenced classes on the classpath — "java/lang/Object" is a
        // conservative but always-valid answer.
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES) {
            @Override
            protected String getCommonSuperClass(String type1, String type2) {
                return "java/lang/Object";
            }
        };
        reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
            @Override
            public MethodVisitor visitMethod(int access, String name, String descriptor,
                                             String signature, String[] exceptions) {
                // Skip — don't write any methods during this pass
                return null;  // returning null tells ASM to skip this method
            }

            @Override
            public void visitEnd() {
                // Now emit all methods in sorted order
                for (CapturedMethod cm : sorted) {
                    MethodVisitor mv = writer.visitMethod(cm.access, cm.name, cm.descriptor,
                                                          cm.signature, cm.exceptions);
                    cm.replayInto(mv);
                }
                super.visitEnd();
            }
        }, ClassReader.EXPAND_FRAMES);

        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("Usage: NormalizeProxyClasses <directory>");
            System.exit(1);
        }

        Path root = Path.of(args[0]);
        int normalized = 0;

        for (var entry : Files.walk(root).toList()) {
            if (!Files.isRegularFile(entry)) continue;
            String name = entry.getFileName().toString();
            if (!name.endsWith(".class")) continue;
            // Clojure proxy classes live in directories named proxy$...
            String fullPath = entry.toString();
            if (!fullPath.contains("proxy$")) continue;

            byte[] original = Files.readAllBytes(entry);
            try {
                byte[] result = normalize(original);
                if (!Arrays.equals(original, result)) {
                    Files.write(entry, result);
                    normalized++;
                }
            } catch (Exception e) {
                System.err.println("  Warning: could not normalize " + entry + ": " + e.getMessage());
            }
        }

        System.out.println("  Normalized " + normalized + " proxy class file(s)");
    }
}
