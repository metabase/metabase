import ts from "typescript";

import {
  indexAccepts,
  isObjectLike,
  isTypeReference,
  properties,
  propertyName,
  propertyType,
  symbolDeclaration,
  typeText,
  unionMembers,
} from "./typescript-utils";

interface Problem {
  status: "mismatch" | "unverified";
  message: string;
}

/** One `any`, `unknown` or unresolved type declaration, with every path that reaches it. */
export interface UnconstrainedPosition {
  side: Side;
  type: string;
  /** The declaring type and member with `file:line`, absent for a member TypeScript synthesized. */
  declaration?: string;
  /** Sorted shortest first, then alphabetically. */
  paths: string[];
}

interface Unconstrained {
  /** The backend route and part, e.g. `POST /api/document request body`. */
  location: string;
  positions: UnconstrainedPosition[];
}

export interface Verdict {
  status: "compatible" | Problem["status"];
  message: string;
  unconstrained?: Unconstrained[];
}

export interface CompareContext {
  checker: ts.TypeChecker;
  root: string;
  /** Replace `WALK_STEP_BUDGET` and `WALK_DEPTH_BUDGET`, so a spec can reach a limit with a small type. */
  walkStepBudget?: number;
  walkDepthBudget?: number;
}

/**
 * The most types one walk may visit, and the deepest it may go, before it is treated as not terminating.
 * Real walks stay far below both, so reaching either means a type keeps producing new types.
 */
export const WALK_STEP_BUDGET = 20_000_000;
export const WALK_DEPTH_BUDGET = 1_000;

/** A type walk that went past its budget or overflowed the call stack. */
export class TypeWalkError extends Error {
  override name = "TypeWalkError";
}

export function isStackOverflow(error: unknown): boolean {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

// Writes a run of one repeated segment once with its count, so a runaway path or type stays readable.
function compactPath(path: string): string {
  return path.replace(
    /(\.[^.[\]]+|\[\]|\[key\])\1{2,}/g,
    (run: string, segment: string) =>
      `${segment}×${run.length / segment.length}`,
  );
}

// Printing a type that grows each time it recurs can itself overflow the call stack.
function printableType(checker: ts.TypeChecker, type: ts.Type): string {
  try {
    return typeText(checker, type);
  } catch (error) {
    if (!isStackOverflow(error)) {
      throw error;
    }
    const name = (type.aliasSymbol ?? type.getSymbol())?.name;
    return name ? `${name} (too deep to print)` : "a type too deep to print";
  }
}

class TypeWalk {
  private steps = 0;
  private type: ts.Type | undefined;
  private position: Position | undefined;

  constructor(
    private readonly context: CompareContext,
    private readonly name: string,
  ) {}

  step(type: ts.Type, position: Position, depth: number): void {
    this.steps += 1;
    // An object type names what the walk was inside better than a primitive leaf does.
    if (type.flags & ts.TypeFlags.Object || !this.type) {
      this.type = type;
      this.position = position;
    }
    const stepBudget = this.context.walkStepBudget ?? WALK_STEP_BUDGET;
    if (this.steps > stepBudget) {
      throw this.error(`went past its budget of ${stepBudget} steps`);
    }
    const depthBudget = this.context.walkDepthBudget ?? WALK_DEPTH_BUDGET;
    if (depth > depthBudget) {
      throw this.error(`went past its depth budget of ${depthBudget}`);
    }
  }

  run<T>(walk: () => T): T {
    try {
      return walk();
    } catch (error) {
      if (isStackOverflow(error)) {
        throw this.error("overflowed the call stack");
      }
      throw error;
    }
  }

  private error(reason: string): TypeWalkError {
    const { checker, root } = this.context;
    const { type, position } = this;
    const typeDeclaration = (type?.aliasSymbol ?? type?.getSymbol())
      ?.declarations?.[0];
    // An anonymous type literal is better located by the member that holds it.
    const declaration =
      typeDeclaration && ts.getNameOfDeclaration(typeDeclaration)
        ? typeDeclaration
        : (position?.declaration ?? typeDeclaration);
    const typeName = type
      ? compactPath(printableType(checker, type))
      : "unknown";
    const location = declaration
      ? declarationLabel(declaration, root)
      : "no declaration";
    return new TypeWalkError(
      `the ${this.name} ${reason} at ${compactPath(position?.path ?? "$")} in type ${typeName} (${location})`,
    );
  }
}

interface Position {
  path: string;
  declaration: ts.Declaration | undefined;
}

export type Side = "frontend" | "backend";

interface Direction {
  from: Side;
  to: Side;
}

export const LINE_BREAK = "\n  ";

export const COMPATIBLE: Verdict = {
  status: "compatible",
  message: "Compatible",
};

const ROOT: Position = { path: "$", declaration: undefined };

function uniqueLines(lines: string[]): string {
  return [...new Set(lines)].join(LINE_BREAK);
}

function problemStatus(problems: Problem[]): Problem["status"] {
  return problems.some((problem) => problem.status === "mismatch")
    ? "mismatch"
    : "unverified";
}

function declaringTypeName(declaration: ts.Declaration): string | undefined {
  const parent = declaration.parent;
  if (ts.isInterfaceDeclaration(parent)) {
    return parent.name.text;
  }
  if (
    ts.isTypeLiteralNode(parent) &&
    ts.isTypeAliasDeclaration(parent.parent)
  ) {
    return parent.parent.name.text;
  }
  return undefined;
}

function memberSuffix(declaration: ts.Declaration): string {
  if (ts.isIndexSignatureDeclaration(declaration)) {
    return "[key]";
  }
  const name = ts.getNameOfDeclaration(declaration);
  if (!name) {
    return "";
  }
  return ts.isComputedPropertyName(name)
    ? name.getText()
    : `.${propertyName(name) ?? name.getText()}`;
}

// A member of an unnamed type literal gets its column too, so two members on one line stay apart.
function declarationLabel(declaration: ts.Declaration, root: string): string {
  const source = declaration.getSourceFile();
  const file = source.fileName.replace(`${root}/`, "");
  const { line, character } = source.getLineAndCharacterOfPosition(
    declaration.getStart(),
  );
  const owner = declaringTypeName(declaration);
  const member = memberSuffix(declaration);
  const where = `${file}:${line + 1}:${character + 1}`;
  if (owner) {
    return `${owner}${member} (${file}:${line + 1})`;
  }
  return member ? `${member.replace(/^\./, "")} (${where})` : where;
}

export function fieldLabel(
  path: string,
  declaration: ts.Declaration | undefined,
  root: string,
): string {
  if (!declaration) {
    return path;
  }
  const source = declaration.getSourceFile();
  const file = source.fileName.replace(`${root}/`, "");
  const line =
    source.getLineAndCharacterOfPosition(declaration.getStart()).line + 1;
  const owner = declaringTypeName(declaration);
  const location = owner
    ? `${file}:${line} ${owner}${memberSuffix(declaration)}`
    : `${file}:${line}`;
  return `${path} (${location})`;
}

function mismatchDetail(
  context: CompareContext,
  direction: Direction,
  from: ts.Type,
  to: ts.Type,
  at: ts.Node,
  position: Position,
): string {
  const { checker, root } = context;
  const walk = new TypeWalk(context, "mismatch walk");
  const messages: string[] = [];
  const ancestors: { from: ts.Type; to: ts.Type; path: string }[] = [];
  const notAssignable = (label: string, from: ts.Type, to: ts.Type): string =>
    `${label}: ${direction.from} type ${typeText(checker, from)} is not assignable to ${direction.to} type ${typeText(checker, to)}`;
  const visit = (
    from: ts.Type,
    to: ts.Type,
    path: string,
    frontend: ts.Declaration | undefined,
  ) => {
    walk.step(from, { path, declaration: frontend }, ancestors.length);
    if (checker.isTypeAssignableTo(from, to)) {
      return;
    }
    const label = fieldLabel(path, frontend, root);
    const repeated = ancestors.find(
      (ancestor) => ancestor.from === from && ancestor.to === to,
    );
    if (repeated) {
      messages.push(
        `${notAssignable(label, from, to)}, the same types as at ${repeated.path}`,
      );
      return;
    }
    ancestors.push({ from, to, path });
    const before = messages.length;
    if (from.isUnion()) {
      unionMembers(checker, from).forEach((type) =>
        visit(type, to, path, frontend),
      );
    } else {
      const target = checker.getNonNullableType(to);
      const fromElement =
        checker.isArrayType(from) &&
        checker.getIndexTypeOfType(from, ts.IndexKind.Number);
      const toElement =
        checker.isArrayType(target) &&
        checker.getIndexTypeOfType(target, ts.IndexKind.Number);
      if (fromElement && toElement) {
        visit(fromElement, toElement, `${path}[]`, undefined);
      } else if (
        from.flags & ts.TypeFlags.Object &&
        target.flags & ts.TypeFlags.Object
      ) {
        for (const property of properties(target)) {
          const actualProperty = from.getProperty(property.name);
          const field = `${path}.${property.name}`;
          const frontendProperty = symbolDeclaration(
            direction.to === "frontend" ? property : actualProperty,
          );
          const propertyLabel = fieldLabel(field, frontendProperty, root);
          if (!(property.flags & ts.SymbolFlags.Optional) && !actualProperty) {
            messages.push(
              `${propertyLabel}: property required by the ${direction.to} type is missing from the ${direction.from} type`,
            );
          } else if (
            !(property.flags & ts.SymbolFlags.Optional) &&
            actualProperty &&
            actualProperty.flags & ts.SymbolFlags.Optional
          ) {
            messages.push(
              `${propertyLabel}: property is optional in the ${direction.from} type but required by the ${direction.to} type`,
            );
          } else {
            const actual =
              propertyType(checker, from, property.name, at) ??
              checker.getUndefinedType();
            visit(
              actual,
              checker.getTypeOfSymbolAtLocation(property, at),
              field,
              frontendProperty,
            );
          }
        }
      }
    }
    ancestors.pop();
    if (messages.length === before) {
      messages.push(notAssignable(label, from, to));
    }
  };
  walk.run(() => visit(from, to, position.path, position.declaration));
  return uniqueLines(messages);
}

/**
 * Every field of `sent` that `declaredBy` does not declare, and in a response also every backend value
 * the frontend type does not accept.
 */
function fieldCoverageProblems(
  context: CompareContext,
  declaredBy: ts.Type,
  sent: ts.Type,
  at: ts.Node,
  kind: "request" | "response",
): Problem[] {
  const { checker, root } = context;
  const walk = new TypeWalk(context, "field coverage walk");
  const problems: Problem[] = [];
  const ids = new Map<ts.Type, number>();
  const idOf = (type: ts.Type): number => {
    const known = ids.get(type);
    if (known !== undefined) {
      return known;
    }
    ids.set(type, ids.size);
    return ids.size - 1;
  };
  const pairKey = (variant: ts.Type, candidates: ts.Type[]) =>
    `${idOf(variant)}:${candidates.map(idOf).sort().join(",")}`;
  // Each pair of frontend variant and backend candidates is walked once.
  // A repeat still on the walk is a recursive type, and a finished repeat points back to the first path.
  const walking = new Set<string>();
  const walked = new Map<string, { path: string; problems: Problem[] }>();
  const visit = (
    backendTypes: ts.Type[],
    frontend: ts.Type,
    path: string,
    declaration: ts.Declaration | undefined,
    depth: number,
  ) => {
    walk.step(frontend, { path, declaration }, depth);
    const label = fieldLabel(path, declaration, root);
    const unassignable =
      kind === "response"
        ? backendTypes.filter(
            (type) => !checker.isTypeAssignableTo(type, frontend),
          )
        : [];
    if (unassignable.length) {
      problems.push(
        ...unassignable.map(
          (type): Problem => ({
            status: "mismatch",
            message: `${label}: backend type ${typeText(checker, type)} is not assignable to frontend type ${typeText(checker, frontend)}`,
          }),
        ),
      );
      return;
    }
    for (const variant of unionMembers(checker, frontend)) {
      if (!isObjectLike(variant)) {
        continue;
      }
      const candidates = [
        ...new Set(backendTypes.flatMap((type) => unionMembers(checker, type))),
      ].filter((type) =>
        kind === "response"
          ? checker.isTypeAssignableTo(type, variant)
          : checker.isTypeAssignableTo(variant, type),
      );
      const key = pairKey(variant, candidates);
      const first = walked.get(key);
      if (first) {
        if (first.problems.length) {
          problems.push({
            status: problemStatus(first.problems),
            message: `${label}: same problems as at ${first.path}`,
          });
        }
        continue;
      }
      if (walking.has(key)) {
        continue;
      }
      walking.add(key);
      const start = problems.length;
      coverVariant(variant, candidates, path, label, depth);
      walking.delete(key);
      walked.set(key, { path, problems: problems.slice(start) });
    }
  };
  const coverVariant = (
    variant: ts.Type,
    candidates: ts.Type[],
    path: string,
    label: string,
    depth: number,
  ) => {
    if (!candidates.length) {
      if (kind === "request") {
        // The request direction only reports fields the backend does not declare.
        return;
      }
      problems.push({
        status: "unverified",
        message: `${label}: cannot establish frontend field coverage for frontend union variant ${typeText(checker, variant)}, which no backend type at this position is assignable to.`,
      });
      return;
    }
    if (checker.isArrayType(variant)) {
      const element = checker.getIndexTypeOfType(variant, ts.IndexKind.Number);
      const elements = candidates.flatMap((type) => {
        const value = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
        return value ? [value] : [];
      });
      if (element) {
        visit(elements, element, `${path}[]`, undefined, depth + 1);
      }
      return;
    }
    const tuple = checker.isTupleType(variant);
    for (const property of properties(variant)) {
      if (tuple && !/^\d+$/.test(property.name)) {
        continue;
      }
      // A symbol-keyed or function-valued property is never part of what is sent or received.
      if (
        property.name.startsWith("__@") ||
        (kind === "request" &&
          checker.getTypeOfSymbol(property).getCallSignatures().length > 0)
      ) {
        continue;
      }
      const field = tuple
        ? `${path}[${property.name}]`
        : `${path}.${property.name}`;
      const values = candidates.flatMap((type) => {
        const declared = propertyType(checker, type, property.name, at);
        if (declared) {
          return [declared];
        }
        const key = checker.getStringLiteralType(property.name);
        return checker
          .getIndexInfosOfType(type)
          .filter((index) => indexAccepts(checker, key, index.keyType))
          .map((index) => index.type);
      });
      const propertyDeclaration = symbolDeclaration(property);
      if (!values.length) {
        problems.push({
          status: "mismatch",
          message:
            kind === "response"
              ? `${fieldLabel(field, propertyDeclaration, root)}: frontend field is not declared in the backend schema.`
              : `${fieldLabel(field, propertyDeclaration, root)}: frontend sends a field the backend type does not declare`,
        });
        continue;
      }
      visit(
        values,
        checker.getTypeOfSymbolAtLocation(property, at),
        field,
        propertyDeclaration,
        depth + 1,
      );
    }
    for (const index of checker.getIndexInfosOfType(variant)) {
      const values = candidates.flatMap((type) =>
        checker
          .getIndexInfosOfType(type)
          .filter((backendIndex) =>
            indexAccepts(checker, index.keyType, backendIndex.keyType),
          )
          .map((backendIndex) => backendIndex.type),
      );
      const field = `${path}[key]`;
      if (!values.length) {
        problems.push({
          status: "mismatch",
          message:
            kind === "response"
              ? `${fieldLabel(field, index.declaration, root)}: frontend index signature is not declared in the backend schema.`
              : `${fieldLabel(field, index.declaration, root)}: frontend sends keys the backend type does not declare`,
        });
        continue;
      }
      visit(values, index.type, field, index.declaration, depth + 1);
    }
  };
  walk.run(() => visit([declaredBy], sent, "$", undefined, 0));
  return problems;
}

const LOOSE_TYPE_FLAGS =
  ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter;

function comparePaths(left: string, right: string): number {
  return (
    left.length - right.length || (left < right ? -1 : left > right ? 1 : 0)
  );
}

function positionKey({
  side,
  type,
  declaration,
  paths,
}: UnconstrainedPosition) {
  return `${side}|${type}|${declaration ?? `path ${paths[0]}`}`;
}

function sortedPositions(
  positions: UnconstrainedPosition[],
): UnconstrainedPosition[] {
  const merged = new Map<string, Set<string>>();
  const firsts = new Map<string, UnconstrainedPosition>();
  for (const position of positions) {
    const key = positionKey(position);
    const paths = merged.get(key) ?? new Set();
    position.paths.forEach((path) => paths.add(path));
    merged.set(key, paths);
    firsts.set(key, firsts.get(key) ?? position);
  }
  return [...firsts]
    .map(([key, position]) => ({
      ...position,
      paths: [...(merged.get(key) ?? [])].sort(comparePaths),
    }))
    .sort(
      (left, right) =>
        comparePaths(left.paths[0] ?? "", right.paths[0] ?? "") ||
        positionKey(left).localeCompare(positionKey(right)),
    );
}

// Every `any`, `unknown` or unresolved type, each at the shortest path that reaches it.
// The walk goes one path segment at a time and walks each object type once, at its first, shortest path.
// Listing every path instead does not finish: the MBQL expression types reach each other in every order.
function unconstrainedPositions(
  context: CompareContext,
  side: Side,
  type: ts.Type,
  at: ts.Node,
  position: Position,
): UnconstrainedPosition[] {
  const { checker, root } = context;
  const walk = new TypeWalk(context, "unconstrained type walk");
  const found: UnconstrainedPosition[] = [];
  const visited = new Set<ts.Type>();
  let depth = 0;
  // Union and intersection members sit at the same path as the union, so they join the current level.
  const reach = (
    reached: ts.Type,
    { path, declaration }: Position,
    level: { type: ts.Type; position: Position }[],
  ): void => {
    walk.step(reached, { path, declaration }, depth);
    if (reached.flags & LOOSE_TYPE_FLAGS) {
      found.push({
        side,
        type: typeText(checker, reached),
        ...(declaration
          ? { declaration: declarationLabel(declaration, root) }
          : {}),
        paths: [path],
      });
      return;
    }
    if (reached.isUnion()) {
      unionMembers(checker, reached).forEach((part) =>
        reach(part, { path, declaration }, level),
      );
      return;
    }
    if (reached.isIntersection()) {
      reached.types.forEach((part) =>
        reach(part, { path, declaration }, level),
      );
      return;
    }
    if (!(reached.flags & ts.TypeFlags.Object) || visited.has(reached)) {
      return;
    }
    visited.add(reached);
    level.push({ type: reached, position: { path, declaration } });
  };
  walk.run(() => {
    let level: { type: ts.Type; position: Position }[] = [];
    reach(type, position, level);
    while (level.length) {
      depth += 1;
      const next: typeof level = [];
      for (const {
        type: current,
        position: { path },
      } of level) {
        if (
          isTypeReference(current) &&
          (checker.isArrayType(current) || checker.isTupleType(current))
        ) {
          checker
            .getTypeArguments(current)
            .forEach((element) =>
              reach(
                element,
                { path: `${path}[]`, declaration: undefined },
                next,
              ),
            );
          continue;
        }
        checker
          .getIndexInfosOfType(current)
          .forEach((index) =>
            reach(
              index.type,
              { path: `${path}[key]`, declaration: index.declaration },
              next,
            ),
          );
        properties(current).forEach((property) =>
          reach(
            checker.getTypeOfSymbolAtLocation(property, at),
            {
              path: `${path}.${property.name}`,
              declaration: symbolDeclaration(property),
            },
            next,
          ),
        );
      }
      level = next;
    }
  });
  return sortedPositions(found);
}

function unconstrainedLines({ location, positions }: Unconstrained): string[] {
  return [
    `Unconstrained or unresolved types in ${location}:`,
    ...positions.map(({ side, type, declaration, paths }) => {
      const [shortest = "", ...others] = paths;
      const found = declaration
        ? `${declaration}: ${side} type ${type} at ${shortest}`
        : `${shortest}: ${side} type ${type}`;
      return others.length
        ? `${found} and ${others.length} other ${others.length === 1 ? "path" : "paths"}`
        : found;
    }),
  ];
}

function mergeUnconstrained(groups: Unconstrained[]): Unconstrained[] {
  const locations = [...new Set(groups.map(({ location }) => location))];
  return locations.map((location) => ({
    location,
    positions: sortedPositions(
      groups
        .filter((group) => group.location === location)
        .flatMap((group) => group.positions),
    ),
  }));
}

/**
 * An `unverified` verdict for every `any`, `unknown` or unresolved type parameter in `type`.
 * `location` names the backend route and part.
 */
export function looseTypeVerdict(
  context: CompareContext,
  side: Side,
  type: ts.Type,
  at: ts.Node,
  location: string,
  position: Position = ROOT,
): Verdict | undefined {
  const positions = unconstrainedPositions(context, side, type, at, position);
  if (!positions.length) {
    return undefined;
  }
  const unconstrained = [{ location, positions }];
  return {
    status: "unverified",
    message: unconstrained.flatMap(unconstrainedLines).join(LINE_BREAK),
    unconstrained,
  };
}

/** One `unverified` verdict with the positions of every verdict given, or undefined when none is. */
export function looseTypeVerdicts(
  verdicts: (Verdict | undefined)[],
): Verdict | undefined {
  const found = verdicts.filter((verdict) => verdict !== undefined);
  return found.length ? combineVerdicts(found, []) : undefined;
}

export function compareTypes(
  context: CompareContext,
  kind: "request" | "response",
  location: string,
  from: ts.Type,
  to: ts.Type,
  at: ts.Node,
  position: Position = ROOT,
): Verdict {
  const { checker } = context;
  const direction: Direction =
    kind === "response"
      ? { from: "backend", to: "frontend" }
      : { from: "frontend", to: "backend" };
  const gap = looseTypeVerdicts([
    looseTypeVerdict(context, direction.from, from, at, location, position),
    looseTypeVerdict(context, direction.to, to, at, location, {
      path: position.path,
      declaration: undefined,
    }),
  ]);
  if (gap) {
    return gap;
  }
  if (!checker.isTypeAssignableTo(from, to)) {
    return {
      status: "mismatch",
      message: mismatchDetail(context, direction, from, to, at, position),
    };
  }
  const problems = fieldCoverageProblems(
    context,
    kind === "response" ? from : to,
    kind === "response" ? to : from,
    at,
    kind,
  );
  if (!problems.length) {
    return COMPATIBLE;
  }
  return {
    status: problemStatus(problems),
    message: uniqueLines(problems.map((problem) => problem.message)),
  };
}

/** One verdict for several checks of the same part: unverified wins over mismatch. */
export function combineVerdicts(verdicts: Verdict[], notes: string[]): Verdict {
  const failing = verdicts.filter((verdict) => verdict.status !== "compatible");
  const status = failing.some((verdict) => verdict.status === "unverified")
    ? "unverified"
    : failing.length
      ? "mismatch"
      : "compatible";
  const unconstrained = mergeUnconstrained(
    failing.flatMap((verdict) => verdict.unconstrained ?? []),
  );
  const listed = new Set<string>();
  const lines = failing.length
    ? failing.flatMap((verdict) => {
        if (!verdict.unconstrained) {
          return verdict.message.split(LINE_BREAK);
        }
        return unconstrained
          .filter(({ location }) => {
            const first = !listed.has(location);
            listed.add(location);
            return (
              first &&
              verdict.unconstrained?.some(
                (group) => group.location === location,
              )
            );
          })
          .flatMap(unconstrainedLines);
      })
    : [COMPATIBLE.message];
  return {
    status,
    message: [...new Set(lines), ...notes.map((note) => `note: ${note}`)].join(
      LINE_BREAK,
    ),
    ...(unconstrained.length ? { unconstrained } : {}),
  };
}
