// Source of truth for the sibling parse_impl.clj, which is compiled from
// this file by gleam-clj (github.com/escherize/gleam-clj). Nothing in the
// Metabase build reads this file; it is here so the Gleam source and its
// compiled Clojure can be reviewed side by side.

//// A typed reimplementation of metabase.lib.parse: parsing `{{param}}` and
//// `[[optional]]` clauses in native query strings, with best-effort skipping
//// of params inside SQL comments and string literals.
////
//// Faithful port of the Clojure original:
//// - tokenization is sequential pass-by-pass splitting (pattern order
////   matters for overlaps, so a single left-to-right scan would differ)
//// - `{{` only matches when not followed by another `{` (so `{{{x}}` parses
////   as a literal `{` plus a param)
//// - inside string literals, a clause that fails to parse is backtracked to
////   literal text (the original does this with catch/rethrow; here it is a
////   Result)
//// - `strict` mirrors the original's :parse-error-type option: when false,
////   invalid (but terminated) clauses dissolve to nothing instead of erroring

import gleam/list
import gleam/string

pub type Token {
  OptionalBegin
  OptionalEnd
  ParamBegin
  ParamEnd
  SingleQuote
  BlockCommentBegin
  BlockCommentEnd
  LineCommentBegin
  Newline
}

/// Tokenizer output: raw string fragments interleaved with tokens, each
/// token keeping its source text (tokens frequently degrade back to text).
pub type Piece {
  Str(String)
  Tok(Token, String)
}

pub type Fragment {
  Literal(String)
  Param(String)
  Optional(List(Fragment))
}

pub type ParseError {
  /// A `[[` or `{{` with no matching closer.
  Unterminated
  /// `{{...}}` whose contents are not a plain name.
  InvalidParamName
  /// `{{}}` or `{{   }}`.
  EmptyParam
  /// `[[...]]` containing no `{{...}}` clause.
  OptionalWithoutParam
}

// ---------------------------------------------------------------------------
// Tokenizer

type Pattern {
  Lit(String, Token)
  /// `{{` not followed by another `{`.
  ParamBeginPattern
}

fn base_patterns() -> List(Pattern) {
  [
    Lit("[[", OptionalBegin),
    Lit("]]", OptionalEnd),
    ParamBeginPattern,
    Lit("}}", ParamEnd),
    Lit("'", SingleQuote),
  ]
}

fn sql_patterns() -> List(Pattern) {
  list.append(
    [
      Lit("/*", BlockCommentBegin),
      Lit("*/", BlockCommentEnd),
      Lit("--", LineCommentBegin),
      Lit("\n", Newline),
    ],
    base_patterns(),
  )
}

fn split_literal(s: String, pat: String, token: Token, acc: List(Piece)) -> List(Piece) {
  case string.split_once(s, pat) {
    Error(Nil) -> list.reverse([Str(s), ..acc])
    Ok(#(before, after)) ->
      split_literal(after, pat, token, [Tok(token, pat), Str(before), ..acc])
  }
}

/// Find the first `{{` that is not followed by a third `{`; returns the text
/// before it and the text after it.
fn find_param_begin(s: String, before_acc: String) -> Result(#(String, String), Nil) {
  case string.split_once(s, "{{") {
    Error(Nil) -> Error(Nil)
    Ok(#(before, after)) ->
      case string.starts_with(after, "{") {
        False -> Ok(#(before_acc <> before, after))
        True -> find_param_begin("{" <> after, before_acc <> before <> "{")
      }
  }
}

fn split_param_begin(s: String, acc: List(Piece)) -> List(Piece) {
  case find_param_begin(s, "") {
    Error(Nil) -> list.reverse([Str(s), ..acc])
    Ok(#(before, after)) ->
      split_param_begin(after, [Tok(ParamBegin, "{{"), Str(before), ..acc])
  }
}

fn apply_pattern(pieces: List(Piece), pattern: Pattern) -> List(Piece) {
  pieces
  |> list.flat_map(fn(piece) {
    case piece {
      Tok(_, _) -> [piece]
      Str(s) ->
        case pattern {
          Lit(pat, token) -> split_literal(s, pat, token, [])
          ParamBeginPattern -> split_param_begin(s, [])
        }
    }
  })
  |> list.filter(fn(piece) {
    case piece {
      Str("") -> False
      _ -> True
    }
  })
}

pub fn tokenize(s: String, handle_sql_comments: Bool) -> List(Piece) {
  let patterns = case handle_sql_comments {
    True -> sql_patterns()
    False -> base_patterns()
  }
  list.fold(patterns, [Str(s)], apply_pattern)
}

// ---------------------------------------------------------------------------
// Parser

type Mode {
  NoComment
  LineMode
  BlockMode
}

fn combine_adjacent(frags: List(Fragment)) -> List(Fragment) {
  case frags {
    [Literal(a), Literal(b), ..rest] -> combine_adjacent([Literal(a <> b), ..rest])
    [f, ..rest] -> [f, ..combine_adjacent(rest)]
    [] -> []
  }
}

fn invalid(strict: Bool, error: ParseError) -> Result(List(Fragment), ParseError) {
  case strict {
    True -> Error(error)
    False -> Ok([])
  }
}

fn make_param(strict: Bool, contents: List(Fragment)) -> Result(List(Fragment), ParseError) {
  case combine_adjacent(contents) {
    [Literal(k)] ->
      case string.is_empty(string.trim(k)) {
        True -> invalid(strict, EmptyParam)
        False -> Ok([Param(k)])
      }
    _ -> invalid(strict, InvalidParamName)
  }
}

fn make_optional(strict: Bool, contents: List(Fragment)) -> Result(List(Fragment), ParseError) {
  let has_param =
    list.any(contents, fn(f) {
      case f {
        Param(_) -> True
        _ -> False
      }
    })
  case has_param {
    True -> Ok([Optional(combine_adjacent(contents))])
    False -> invalid(strict, OptionalWithoutParam)
  }
}

fn prepend_reversed(frags: List(Fragment), acc: List(Fragment)) -> List(Fragment) {
  list.fold(frags, acc, fn(a, f) { [f, ..a] })
}

/// The state machine. `acc` is built in reverse. Returns the fragments of
/// the current scope plus the unconsumed tokens.
fn parse_tokens(
  strict: Bool,
  tokens: List(Piece),
  optional_level: Int,
  param_level: Int,
  in_string: Bool,
  mode: Mode,
  acc: List(Fragment),
) -> Result(#(List(Fragment), List(Piece)), ParseError) {
  case tokens {
    [] ->
      case optional_level > 0 || param_level > 0 {
        True -> Error(Unterminated)
        False -> Ok(#(list.reverse(acc), []))
      }

    [Str(s), ..more] ->
      parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
        Literal(s),
        ..acc
      ])

    [Tok(token, text), ..more] ->
      case token {
        OptionalBegin ->
          case mode {
            NoComment ->
              enter_clause(
                strict,
                parse_tokens(
                  strict,
                  more,
                  optional_level + 1,
                  param_level,
                  in_string,
                  mode,
                  [],
                ),
                make_optional,
                text,
                more,
                strict,
                tokens_state(optional_level, param_level, in_string, mode),
                acc,
              )
            _ ->
              parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
                Literal(text),
                ..acc
              ])
          }

        ParamBegin ->
          case mode {
            NoComment ->
              enter_clause(
                strict,
                parse_tokens(
                  strict,
                  more,
                  optional_level,
                  param_level + 1,
                  in_string,
                  mode,
                  [],
                ),
                make_param,
                text,
                more,
                strict,
                tokens_state(optional_level, param_level, in_string, mode),
                acc,
              )
            _ ->
              parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
                Literal(text),
                ..acc
              ])
          }

        LineCommentBegin -> enter_comment(strict, LineMode, text, more, optional_level, param_level, in_string, mode, acc)

        BlockCommentBegin -> enter_comment(strict, BlockMode, text, more, optional_level, param_level, in_string, mode, acc)

        BlockCommentEnd ->
          case mode {
            BlockMode -> Ok(#(list.reverse([Literal(text), ..acc]), more))
            _ ->
              parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
                Literal(text),
                ..acc
              ])
          }

        Newline ->
          case mode {
            LineMode -> Ok(#(list.reverse([Literal(text), ..acc]), more))
            _ ->
              parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
                Literal(text),
                ..acc
              ])
          }

        OptionalEnd ->
          case optional_level > 0 {
            True -> Ok(#(list.reverse(acc), more))
            False ->
              parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
                Literal(text),
                ..acc
              ])
          }

        ParamEnd ->
          case param_level > 0 {
            True -> Ok(#(list.reverse(acc), more))
            False ->
              parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
                Literal(text),
                ..acc
              ])
          }

        SingleQuote ->
          parse_tokens(strict, more, optional_level, param_level, !in_string, mode, [
            Literal(text),
            ..acc
          ])
      }
  }
}

/// Bundled loop state so enter_clause/enter_comment can resume the caller.
type State {
  State(optional_level: Int, param_level: Int, in_string: Bool, mode: Mode)
}

fn tokens_state(optional_level: Int, param_level: Int, in_string: Bool, mode: Mode) -> State {
  State(optional_level, param_level, in_string, mode)
}

/// Shared body of the OptionalBegin/ParamBegin cases: run the sub-parse,
/// validate it, and either splice the result in or — when inside a string
/// literal — backtrack the failed clause to literal text.
fn enter_clause(
  strict: Bool,
  sub: Result(#(List(Fragment), List(Piece)), ParseError),
  validate: fn(Bool, List(Fragment)) -> Result(List(Fragment), ParseError),
  text: String,
  more: List(Piece),
  strict2: Bool,
  state: State,
  acc: List(Fragment),
) -> Result(#(List(Fragment), List(Piece)), ParseError) {
  let State(optional_level, param_level, in_string, mode) = state
  let validated = case sub {
    Ok(#(inner, rest)) ->
      case validate(strict2, inner) {
        Ok(frags) -> Ok(#(frags, rest))
        Error(e) -> Error(e)
      }
    Error(e) -> Error(e)
  }
  case validated {
    Ok(#(frags, rest)) ->
      parse_tokens(
        strict,
        rest,
        optional_level,
        param_level,
        in_string,
        mode,
        prepend_reversed(frags, acc),
      )
    Error(e) ->
      case in_string {
        True ->
          parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
            Literal(text),
            ..acc
          ])
        False -> Error(e)
      }
  }
}

fn enter_comment(
  strict: Bool,
  comment_mode: Mode,
  text: String,
  more: List(Piece),
  optional_level: Int,
  param_level: Int,
  in_string: Bool,
  mode: Mode,
  acc: List(Fragment),
) -> Result(#(List(Fragment), List(Piece)), ParseError) {
  let in_clause = optional_level > 0 || param_level > 0
  case mode != NoComment || in_clause || in_string {
    True ->
      parse_tokens(strict, more, optional_level, param_level, in_string, mode, [
        Literal(text),
        ..acc
      ])
    False ->
      case parse_tokens(strict, more, optional_level, param_level, in_string, comment_mode, []) {
        Ok(#(inner, rest)) ->
          parse_tokens(
            strict,
            rest,
            optional_level,
            param_level,
            in_string,
            mode,
            prepend_reversed(inner, [Literal(text), ..acc]),
          )
        Error(e) -> Error(e)
      }
  }
}

/// Parse parameters in `s`, returning literal fragments interleaved with
/// Param and Optional fragments.
pub fn parse(
  s: String,
  handle_sql_comments: Bool,
  strict: Bool,
) -> Result(List(Fragment), ParseError) {
  case tokenize(s, handle_sql_comments) {
    [] -> Ok([])
    [Str(_)] -> Ok([Literal(s)])
    pieces ->
      case parse_tokens(strict, pieces, 0, 0, False, NoComment, []) {
        Ok(#(frags, _)) -> Ok(combine_adjacent(frags))
        Error(e) -> Error(e)
      }
  }
}

pub fn main() {
  // BEAM-side sanity: real gleam runs the same semantics this module claims.
  let assert Ok([Literal("select 1")]) = parse("select 1", True, True)
  let assert Ok([Literal("a="), Param("x")]) = parse("a={{x}}", True, True)
  let assert Ok([Literal("a "), Optional([Literal("b "), Param("x")])]) =
    parse("a [[b {{x}}]]", True, True)
  let assert Ok([Literal("SELECT -- {{foo}}")]) = parse("SELECT -- {{foo}}", True, True)
  let assert Ok([Literal("'{{}}'")]) = parse("'{{}}'", True, True)
  let assert Ok([Literal("'"), Param("x"), Literal("'")]) = parse("'{{x}}'", True, True)
  let assert Ok([Literal("{x: {y: \""), Param("param"), Literal("\"}}")]) =
    parse("{x: {y: \"{{param}}\"}}", True, True)
  let assert Error(Unterminated) = parse("select {{x", True, True)
  let assert Error(OptionalWithoutParam) = parse("[[no params]]", True, True)
}
