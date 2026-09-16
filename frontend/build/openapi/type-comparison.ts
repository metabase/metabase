import ts from "typescript";

import {
  type Shape,
  type ShapeField,
  type ShapeIndex,
  describeShape,
  typeShape,
} from "./shape";
import {
  indexAccepts,
  isObjectLike,
  isTypeReference,
  properties,
  propertyName,
  symbolDeclaration,
  typeText,
  unionMembers,
} from "./typescript-utils";

interface Problem {
  status: "mismatch" | "unverified";
  message: string;
}

/** One `any`, `unknown` or unresolved type declaration, at its first shortest path. */
export interface UnconstrainedPosition {
  side: Side;
  type: string;
  /** The declaring type and member with `file:line`, absent for a member TypeScript synthesized. */
  declaration?: string;
  /** One shortest path; grouped declarations can share this position. */
  paths: string[];
}

interface Unconstrained {
  /** The backend route and part, e.g. `POST /api/document request body`. */
  location: string;
  positions: UnconstrainedPosition[];
}

export interface Verdict {
  status: "compatible" | Problem["status"];
  diagnostics: (string | Unconstrained)[];
  notes?: string[];
}

export interface CompareContext {
  checker: ts.TypeChecker;
  root: string;
  /** Replace `WALK_STEP_BUDGET` and `WALK_DEPTH_BUDGET`, so a spec can reach a limit with a small type. */
  walkStepBudget?: number;
  walkDepthBudget?: number;
}

const WALK_STEP_BUDGET = 20_000_000;
const WALK_DEPTH_BUDGET = 1_000;

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

type Side = "frontend" | "backend";

interface Direction {
  from: Side;
  to: Side;
}

export const LINE_BREAK = "\n  ";

const COMPATIBLE: Verdict = {
  status: "compatible",
  diagnostics: ["Compatible"],
};

const ROOT: Position = { path: "$", declaration: undefined };

function problemStatus(problems: Pick<Problem, "status">[]): Problem["status"] {
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

function fieldLabel(
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

/** The type that stands for the shape, when it has one. */
function shapeType(shape: Shape): ts.Type | undefined {
  switch (shape.kind) {
    case "type":
      return shape.type;
    case "text":
    case "union":
      return undefined;
    default:
      return shape.from;
  }
}

/** The literal types a query or path text can be decoded as: string, boolean or number. */
function textReadings(checker: ts.TypeChecker, text: string): ts.Type[] {
  const readings: ts.Type[] = [checker.getStringLiteralType(text)];
  if (text === "true") {
    readings.push(checker.getTrueType());
  }
  if (text === "false") {
    readings.push(checker.getFalseType());
  }
  if (text !== "" && String(Number(text)) === text) {
    readings.push(checker.getNumberLiteralType(Number(text)));
  }
  return readings;
}

function sentVariants(checker: ts.TypeChecker, shape: Shape): Shape[] {
  if (shape.kind === "union") {
    return shape.members.flatMap((member) => sentVariants(checker, member));
  }
  if (shape.kind === "type" && shape.type.isUnion()) {
    return unionMembers(checker, shape.type).map(typeShape);
  }
  return [shape];
}

function shapeFields(
  checker: ts.TypeChecker,
  sent: Shape,
  at: ts.Node,
  fromFrontend: boolean,
): { fields: ShapeField[]; indexes: ShapeIndex[] } | undefined {
  if (sent.kind === "object") {
    return sent;
  }
  if (sent.kind !== "type") {
    return undefined;
  }
  const tuple = checker.isTupleType(sent.type);
  return {
    fields: properties(sent.type)
      .filter(
        (property) =>
          !property.name.startsWith("__@") &&
          (!tuple || /^\d+$/.test(property.name)) &&
          // A function-valued property is never part of what the frontend sends.
          !(
            fromFrontend &&
            checker.getTypeOfSymbol(property).getCallSignatures().length > 0
          ),
      )
      .map((property) => ({
        name: property.name,
        shape: typeShape(checker.getTypeOfSymbolAtLocation(property, at)),
        optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
        declaration: symbolDeclaration(property),
      })),
    // A tuple's number index signature only restates its numbered members.
    indexes: tuple
      ? []
      : checker.getIndexInfosOfType(sent.type).map((index) => ({
          keyType: index.keyType,
          shape: typeShape(index.type),
          declaration: index.declaration,
        })),
  };
}

function shapeElement(checker: ts.TypeChecker, sent: Shape): Shape | undefined {
  if (sent.kind === "array") {
    return sent.element;
  }
  if (sent.kind === "type" && checker.isArrayType(sent.type)) {
    const element = checker.getIndexTypeOfType(sent.type, ts.IndexKind.Number);
    return element && typeShape(element);
  }
  return undefined;
}

interface WalkPosition extends Position {
  depth: number;
}

interface ShapeComparison {
  position: Position;
  issues: ShapeIssue[];
}

type ShapeIssue = { status: Problem["status"]; position: Position } & (
  | { detail: string }
  | { comparison: ShapeComparison }
);

function renderShapeIssues(issues: ShapeIssue[], root: string): Problem[] {
  const shown = new Map<ShapeComparison, string>();
  const problems: Problem[] = [];
  const visit = (issue: ShapeIssue, from: Position, to: Position): void => {
    const path = to.path + issue.position.path.slice(from.path.length);
    const declaration =
      issue.position.path === from.path &&
      issue.position.declaration === from.declaration
        ? to.declaration
        : issue.position.declaration;
    const label = fieldLabel(path, declaration, root);
    if ("detail" in issue) {
      problems.push({
        status: issue.status,
        message: `${label}: ${issue.detail}`,
      });
      return;
    }
    const previous = shown.get(issue.comparison);
    if (previous !== undefined) {
      problems.push({
        status: issue.status,
        message: `${label}: same problems as at ${previous}`,
      });
      return;
    }
    shown.set(issue.comparison, path);
    issue.comparison.issues.forEach((child) =>
      visit(child, issue.comparison.position, { path, declaration }),
    );
  };
  const origin = { path: "", declaration: undefined };
  issues.forEach((issue) => visit(issue, origin, origin));
  return problems;
}

function shapeProblems(
  context: CompareContext,
  direction: Direction,
  sent: Shape,
  target: ts.Type,
  at: ts.Node,
  position: Position,
): Problem[] {
  const { checker, root } = context;
  const walk = new TypeWalk(context, "field walk");
  const ids = new Map<object, number>();
  const idOf = (key: object): number => {
    const known = ids.get(key);
    if (known !== undefined) {
      return known;
    }
    ids.set(key, ids.size);
    return ids.size - 1;
  };
  const walking = new Set<string>();
  const walked = new Map<string, ShapeComparison>();
  let recursions = 0;
  const mismatch = (position: Position, detail: string): ShapeIssue => ({
    status: "mismatch",
    position,
    detail,
  });
  const notAssignable = (position: Position, sent: Shape, target: ts.Type) =>
    mismatch(
      position,
      `${direction.from} type ${describeShape(checker, sent)} is not assignable to ${direction.to} type ${typeText(checker, target)}`,
    );
  // `siblings` are the other variants sent at this position, kept when one variant is retried against one member.
  const visit = (
    sent: Shape,
    target: ts.Type,
    position: WalkPosition,
    siblings?: Shape[],
  ): ShapeIssue[] => {
    const problems: ShapeIssue[] = [];
    const { path, declaration, depth } = position;
    walk.step(shapeType(sent) ?? target, { path, declaration }, depth);
    const variants = sentVariants(checker, sent);
    const objectTargets = unionMembers(checker, target).filter(isObjectLike);
    for (const variant of variants) {
      problems.push(
        ...visitVariant(
          variant,
          target,
          objectTargets,
          position,
          siblings ?? variants,
        ),
      );
    }
    // A frontend response variant no backend variant fits cannot have its fields checked.
    if (direction.to === "frontend" && objectTargets.length > 1) {
      const sentTypes = variants.flatMap((variant) => {
        const type = shapeType(variant);
        return type ? [type] : [];
      });
      objectTargets
        .filter(
          (member) =>
            !sentTypes.some((type) => checker.isTypeAssignableTo(type, member)),
        )
        .forEach((member) =>
          problems.push({
            status: "unverified",
            position,
            detail: `cannot establish frontend field coverage for frontend union variant ${typeText(checker, member)}, which no backend type at this position is assignable to.`,
          }),
        );
    }

    return problems;
  };

  const visitVariant = (
    sent: Shape,
    target: ts.Type,
    objectTargets: ts.Type[],
    position: WalkPosition,
    siblings: Shape[],
  ): ShapeIssue[] => {
    const { path, declaration, depth } = position;
    switch (sent.kind) {
      case "union":
        return [];
      case "unverified":
        return [{ status: "unverified", position, detail: sent.reason }];
      case "throws":
        return [
          mismatch(position, `${sent.reason}, so the request is never sent`),
        ];
      case "text":
        if (
          !textReadings(checker, sent.text).some((reading) =>
            checker.isTypeAssignableTo(reading, target),
          )
        ) {
          return [
            mismatch(
              position,
              `${direction.from} value ${JSON.stringify(sent.text)} is not assignable to ${direction.to} type ${typeText(checker, target)}`,
            ),
          ];
        }
        return [];
      case "null":
        if (!checker.isTypeAssignableTo(checker.getNullType(), target)) {
          return [
            mismatch(
              position,
              `${direction.from} value null, from ${typeText(checker, sent.from)}, is not assignable to ${direction.to} type ${typeText(checker, target)}`,
            ),
          ];
        }
        return [];
      case "empty":
        if (
          !objectTargets.some((member) =>
            properties(member).every(
              (property) => (property.flags & ts.SymbolFlags.Optional) !== 0,
            ),
          )
        ) {
          return [
            mismatch(
              position,
              `${direction.from} value {}, from ${typeText(checker, sent.from)}, is not assignable to ${direction.to} type ${typeText(checker, target)}`,
            ),
          ];
        }
        return [];
      case "items": {
        // Each item is compared with the array element the backend declares.
        // A backend type without an array still gets the whole array compared, as it would receive repeated keys.
        const elements = objectTargets.flatMap((member) => {
          const element =
            checker.isArrayType(member) &&
            checker.getIndexTypeOfType(member, ts.IndexKind.Number);
          return element ? [element] : [];
        });
        if (!elements.length) {
          const problems: ShapeIssue[] = [];
          if (!checker.isTypeAssignableTo(sent.from, target)) {
            problems.push(
              notAssignable(position, typeShape(sent.from), target),
            );
          }
          problems.push(
            ...visit(sent.item, target, {
              path: `${path}[]`,
              declaration,
              depth: depth + 1,
            }),
          );
          return problems;
        }
        return visitAgainstAny(sent.item, elements, target, {
          path: `${path}[]`,
          declaration,
          depth: depth + 1,
        });
      }
      case "type":
        if (!isObjectLike(sent.type)) {
          return checker.isTypeAssignableTo(sent.type, target)
            ? []
            : [notAssignable(position, sent, target)];
        }
        break;
      case "object":
      case "array":
        break;
    }
    if (!objectTargets.length) {
      const type = shapeType(sent);
      return type && checker.isTypeAssignableTo(type, target)
        ? []
        : [notAssignable(position, sent, target)];
    }
    const pair = `${idOf(sent.kind === "type" ? sent.type : sent)}|${idOf(target)}`;
    const key =
      direction.to === "frontend"
        ? `${pair}|${siblings.map((sibling) => idOf(sibling.kind === "type" ? sibling.type : sibling)).join(",")}`
        : pair;
    let comparison = walked.get(key);
    if (!comparison) {
      if (walking.has(pair)) {
        recursions += 1;
        return [];
      }
      walking.add(pair);
      const before = recursions;
      const [only] = objectTargets;
      const found =
        only && objectTargets.length === 1
          ? compareInto(sent, only, target, position, siblings)
          : visitAgainstAny(sent, objectTargets, target, position, siblings);
      walking.delete(pair);
      comparison = { position, issues: found };
      // A recursive assumption is valid only inside the comparison that is still checking it.
      if (before === recursions) {
        walked.set(key, comparison);
      }
    }
    return comparison.issues.length
      ? [{ status: problemStatus(comparison.issues), position, comparison }]
      : [];
  };

  // The value fits when any one member accepts it. The one member its type is assignable to gets
  // its disagreements listed; with none, or several, the whole is reported as one line.
  const visitAgainstAny = (
    sent: Shape,
    members: ts.Type[],
    whole: ts.Type,
    position: WalkPosition,
    siblings?: Shape[],
  ): ShapeIssue[] => {
    const type = sent.kind === "type" ? sent.type : undefined;
    const candidates = type
      ? members.filter((member) => checker.isTypeAssignableTo(type, member))
      : members;
    const [only] = candidates;
    if (candidates.length === 1 && only) {
      return visit(sent, only, position, siblings);
    }
    const attempts: ShapeIssue[][] = [];
    for (const member of candidates) {
      const found = visit(sent, member, position, siblings);
      if (!found.length) {
        return [];
      }
      attempts.push(found);
    }
    const undecided = attempts.find((attempt) =>
      attempt.every((problem) => problem.status === "unverified"),
    );
    return undecided ?? [notAssignable(position, sent, whole)];
  };

  const compareInto = (
    sent: Shape,
    member: ts.Type,
    whole: ts.Type,
    position: WalkPosition,
    siblings: Shape[],
  ): ShapeIssue[] => {
    const problems: ShapeIssue[] = [];
    const { path, depth } = position;
    const sentElement = shapeElement(checker, sent);
    const memberElement =
      checker.isArrayType(member) &&
      checker.getIndexTypeOfType(member, ts.IndexKind.Number);
    if (sentElement && memberElement) {
      return visit(sentElement, memberElement, {
        path: `${path}[]`,
        declaration: undefined,
        depth: depth + 1,
      });
    }
    // A declared type is what TypeScript compares; a shape the client assembled has no whole to compare.
    const assignable =
      sent.kind === "type"
        ? checker.isTypeAssignableTo(sent.type, member)
        : undefined;
    const shape = shapeFields(checker, sent, at, direction.from === "frontend");
    if (!shape || sentElement || checker.isArrayType(member)) {
      if (assignable !== true) {
        problems.push(notAssignable(position, sent, whole));
      }
      return problems;
    }
    // A frontend response field counts as declared when any backend variant this member accepts declares it.
    const siblingShapes =
      direction.to === "frontend"
        ? siblings
            .filter((sibling) => {
              const siblingType = shapeType(sibling);
              return (
                sibling !== sent &&
                siblingType !== undefined &&
                checker.isTypeAssignableTo(siblingType, member)
              );
            })
            .flatMap(
              (sibling) =>
                shapeFields(
                  checker,
                  sibling,
                  at,
                  direction.from === "frontend",
                ) ?? [],
            )
        : [];
    const declaredBySibling = (name: string) =>
      siblingShapes.some(
        (sibling) =>
          sibling.fields.some((field) => field.name === name) ||
          sibling.indexes.some((index) =>
            indexAccepts(
              checker,
              checker.getStringLiteralType(name),
              index.keyType,
            ),
          ),
      );
    const tupleMember = checker.isTupleType(member);
    const targetIndexes = tupleMember
      ? []
      : checker.getIndexInfosOfType(member);
    const targetNames = new Set<string>();
    for (const property of properties(member)) {
      if (
        property.name.startsWith("__@") ||
        (tupleMember && !/^\d+$/.test(property.name))
      ) {
        continue;
      }
      targetNames.add(property.name);
      const field = tupleMember
        ? `${path}[${property.name}]`
        : `${path}.${property.name}`;
      const required = !(property.flags & ts.SymbolFlags.Optional);
      const index = shape.indexes.find((index) =>
        indexAccepts(
          checker,
          checker.getStringLiteralType(property.name),
          index.keyType,
        ),
      );
      const found =
        shape.fields.find((candidate) => candidate.name === property.name) ??
        (index
          ? {
              name: property.name,
              shape: index.shape,
              optional: true,
              declaration: index.declaration,
            }
          : undefined);
      const frontendDeclaration =
        direction.to === "frontend"
          ? symbolDeclaration(property)
          : found?.declaration;
      if (!found) {
        if (required) {
          problems.push(
            mismatch(
              { path: field, declaration: frontendDeclaration },
              `property required by the ${direction.to} type is missing from the ${direction.from} type`,
            ),
          );
        } else if (
          direction.to === "frontend" &&
          !declaredBySibling(property.name)
        ) {
          problems.push(
            mismatch(
              { path: field, declaration: frontendDeclaration },
              `frontend field is not declared in the backend schema.`,
            ),
          );
        }
        continue;
      }
      if (required && found.optional) {
        problems.push(
          mismatch(
            { path: field, declaration: frontendDeclaration },
            `property is optional in the ${direction.from} type but required by the ${direction.to} type`,
          ),
        );
      }
      problems.push(
        ...visit(found.shape, checker.getTypeOfSymbolAtLocation(property, at), {
          path: field,
          declaration: frontendDeclaration,
          depth: depth + 1,
        }),
      );
    }
    for (const field of shape.fields.filter(
      ({ name }) => !targetNames.has(name),
    )) {
      const index = targetIndexes.find((candidate) =>
        indexAccepts(
          checker,
          checker.getStringLiteralType(field.name),
          candidate.keyType,
        ),
      );
      const fieldPath = `${path}.${field.name}`;
      if (index) {
        problems.push(
          ...visit(field.shape, index.type, {
            path: fieldPath,
            declaration: field.declaration,
            depth: depth + 1,
          }),
        );
      } else if (direction.from === "frontend") {
        problems.push(
          mismatch(
            { path: fieldPath, declaration: field.declaration },
            `frontend sends a field the backend type does not declare`,
          ),
        );
      }
    }
    for (const index of shape.indexes) {
      const accepting = targetIndexes.filter((candidate) =>
        indexAccepts(checker, index.keyType, candidate.keyType),
      );
      const indexPath = `${path}[key]`;
      if (accepting.length) {
        problems.push(
          ...visitAgainstAny(
            index.shape,
            accepting.map((candidate) => candidate.type),
            whole,
            {
              path: indexPath,
              declaration: index.declaration,
              depth: depth + 1,
            },
          ),
        );
      } else if (direction.from === "frontend") {
        problems.push(
          mismatch(
            { path: indexPath, declaration: index.declaration },
            `frontend sends keys the backend type does not declare`,
          ),
        );
      }
    }
    // A frontend response index signature has to be declared by the backend too.
    if (direction.to === "frontend") {
      for (const index of targetIndexes) {
        const indexPath = `${path}[key]`;
        const sentIndexes = shape.indexes.filter((candidate) =>
          indexAccepts(checker, index.keyType, candidate.keyType),
        );
        if (!sentIndexes.length) {
          if (
            siblingShapes.some((sibling) =>
              sibling.indexes.some((candidate) =>
                indexAccepts(checker, index.keyType, candidate.keyType),
              ),
            )
          ) {
            continue;
          }
          problems.push(
            mismatch(
              { path: indexPath, declaration: index.declaration },
              `frontend index signature is not declared in the backend schema.`,
            ),
          );
          continue;
        }
        sentIndexes.forEach((candidate) =>
          problems.push(
            ...visit(candidate.shape, index.type, {
              path: indexPath,
              declaration: index.declaration,
              depth: depth + 1,
            }),
          ),
        );
      }
    }
    if (!problems.length && assignable === false) {
      problems.push(notAssignable(position, sent, whole));
    }

    return problems;
  };

  return walk.run(() =>
    renderShapeIssues(visit(sent, target, { ...position, depth: 0 }), root),
  );
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
  const merged = new Map<
    string,
    { position: UnconstrainedPosition; paths: Set<string> }
  >();
  for (const position of positions) {
    const key = positionKey(position);
    let entry = merged.get(key);
    if (!entry) {
      entry = { position, paths: new Set() };
      merged.set(key, entry);
    }
    for (const path of position.paths) {
      entry.paths.add(path);
    }
  }
  return [...merged.values()]
    .map(({ position, paths }) => ({
      ...position,
      paths: [...paths].sort(comparePaths),
    }))
    .sort(
      (left, right) =>
        comparePaths(left.paths[0] ?? "", right.paths[0] ?? "") ||
        positionKey(left).localeCompare(positionKey(right)),
    );
}

// Every `any`, `unknown` or unresolved type in a shape, each at the shortest path that reaches it.
// The walk goes one path segment at a time and walks each object type once, at its first, shortest path.
// Listing every path instead does not finish: the MBQL expression types reach each other in every order.
function unconstrainedPositions(
  context: CompareContext,
  side: Side,
  root: Shape,
  at: ts.Node,
  position: Position,
): UnconstrainedPosition[] {
  const { checker, root: rootDirectory } = context;
  const walk = new TypeWalk(context, "unconstrained type walk");
  const found: UnconstrainedPosition[] = [];
  const visited = new Set<ts.Type | Shape>();
  let depth = 0;
  type Entry = { shape: Shape; position: Position };
  // Union members and the values a field may hold sit at the same path, so they join the current level.
  const reach = (
    shape: Shape,
    { path, declaration }: Position,
    level: Entry[],
  ): void => {
    const reached = shapeType(shape);
    walk.step(
      reached ?? checker.getUnknownType(),
      { path, declaration },
      depth,
    );
    switch (shape.kind) {
      case "union":
        shape.members.forEach((member) =>
          reach(member, { path, declaration }, level),
        );
        return;
      case "text":
      case "null":
      case "empty":
      case "throws":
      case "unverified":
        return;
      case "object":
      case "array":
      case "items":
        if (visited.has(shape)) {
          return;
        }
        visited.add(shape);
        level.push({ shape, position: { path, declaration } });
        return;
      case "type":
        break;
    }
    const { type } = shape;
    if (type.flags & LOOSE_TYPE_FLAGS) {
      found.push({
        side,
        type: typeText(checker, type),
        ...(declaration
          ? { declaration: declarationLabel(declaration, rootDirectory) }
          : {}),
        paths: [path],
      });
      return;
    }
    if (type.isUnion()) {
      unionMembers(checker, type).forEach((member) =>
        reach(typeShape(member), { path, declaration }, level),
      );
      return;
    }
    if (type.isIntersection()) {
      type.types.forEach((member) =>
        reach(typeShape(member), { path, declaration }, level),
      );
      return;
    }
    if (!(type.flags & ts.TypeFlags.Object) || visited.has(type)) {
      return;
    }
    visited.add(type);
    level.push({ shape, position: { path, declaration } });
  };
  const children = (shape: Shape, path: string, next: Entry[]): void => {
    switch (shape.kind) {
      case "object":
        shape.fields.forEach((field) =>
          reach(
            field.shape,
            { path: `${path}.${field.name}`, declaration: field.declaration },
            next,
          ),
        );
        shape.indexes.forEach((index) =>
          reach(
            index.shape,
            { path: `${path}[key]`, declaration: index.declaration },
            next,
          ),
        );
        return;
      case "array":
        reach(
          shape.element,
          { path: `${path}[]`, declaration: undefined },
          next,
        );
        return;
      case "items":
        reach(shape.item, { path: `${path}[]`, declaration: undefined }, next);
        return;
      case "type": {
        const { type } = shape;
        if (
          isTypeReference(type) &&
          (checker.isArrayType(type) || checker.isTupleType(type))
        ) {
          checker
            .getTypeArguments(type)
            .forEach((element) =>
              reach(
                typeShape(element),
                { path: `${path}[]`, declaration: undefined },
                next,
              ),
            );
          return;
        }
        checker
          .getIndexInfosOfType(type)
          .forEach((index) =>
            reach(
              typeShape(index.type),
              { path: `${path}[key]`, declaration: index.declaration },
              next,
            ),
          );
        properties(type).forEach((property) =>
          reach(
            typeShape(checker.getTypeOfSymbolAtLocation(property, at)),
            {
              path: `${path}.${property.name}`,
              declaration: symbolDeclaration(property),
            },
            next,
          ),
        );
        return;
      }
      default:
        return;
    }
  };
  walk.run(() => {
    let level: Entry[] = [];
    reach(root, position, level);
    while (level.length) {
      depth += 1;
      const next: Entry[] = [];
      for (const {
        shape,
        position: { path },
      } of level) {
        children(shape, path, next);
      }
      level = next;
    }
  });
  return found;
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

/** An `unverified` verdict for every `any`, `unknown` or unresolved type parameter inside a shape. */
export function looseShapeVerdict(
  context: CompareContext,
  side: Side,
  shape: Shape,
  at: ts.Node,
  location: string,
): Verdict | undefined {
  const positions = unconstrainedPositions(context, side, shape, at, ROOT);
  if (!positions.length) {
    return undefined;
  }
  return {
    status: "unverified",
    diagnostics: [{ location, positions }],
  };
}

export function compareShape(
  context: CompareContext,
  kind: "request" | "response",
  location: string,
  sent: Shape,
  target: ts.Type,
  at: ts.Node,
): Verdict {
  const direction: Direction =
    kind === "response"
      ? { from: "backend", to: "frontend" }
      : { from: "frontend", to: "backend" };
  const gaps = [
    looseShapeVerdict(context, direction.from, sent, at, location),
    looseShapeVerdict(context, direction.to, typeShape(target), at, location),
  ].filter((verdict) => verdict !== undefined);
  if (gaps.length) {
    return combineVerdicts(gaps, []);
  }
  const problems = shapeProblems(context, direction, sent, target, at, ROOT);
  if (!problems.length) {
    return COMPATIBLE;
  }
  return {
    status: problemStatus(problems),
    diagnostics: problems.map((problem) => problem.message),
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
  return {
    status,
    diagnostics: failing.length
      ? failing.flatMap((verdict) => verdict.diagnostics)
      : COMPATIBLE.diagnostics,
    notes,
  };
}

export function renderDiagnostics(
  diagnostics: Verdict["diagnostics"],
  notes: string[] = [],
): { message: string; unconstrained?: UnconstrainedPosition[] } {
  const positions = sortedPositions(
    diagnostics.flatMap((diagnostic) =>
      typeof diagnostic === "string" ? [] : diagnostic.positions,
    ),
  );
  const firstGroup = diagnostics.findIndex(
    (diagnostic) => typeof diagnostic !== "string",
  );
  const lines = diagnostics.flatMap((diagnostic, index) =>
    typeof diagnostic === "string"
      ? [diagnostic]
      : index === firstGroup
        ? unconstrainedLines({ location: diagnostic.location, positions })
        : [],
  );
  return {
    message: [...new Set(lines), ...notes.map((note) => `note: ${note}`)].join(
      LINE_BREAK,
    ),
    ...(positions.length ? { unconstrained: positions } : {}),
  };
}
