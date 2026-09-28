/**
 * Translation between the LLM providers' wire formats and AI SDK's.
 *
 * <p>Every package here is {@code @NullMarked}: a type says {@code @Nullable} when it may be null, and
 * {@code mb.javac/lint!} holds the code to that with NullAway. NullAway does not check a variable bound by a record
 * pattern, though (uber/NullAway#840), so two rules keep that from hiding a null:
 *
 * <ul>
 *   <li>A parser resolves what the wire failed to send: a required value that is missing makes the event a
 *       {@code Malformed} one, which its translator reports and drops, rather than a record holding null. Only what the
 *       wire may genuinely omit, like usage or an id, stays {@code @Nullable}.
 *   <li>A record pattern never binds a {@code @Nullable} component: match the record whole, or use {@code _} for that
 *       component, and read it through its accessor, which NullAway does check.
 * </ul>
 */
@NullMarked
package metabase.metabot.providers;

import org.jspecify.annotations.NullMarked;
