import type { Node } from "metabase-lib/v1/expressions/pratt";
import { lexify, parse } from "metabase-lib/v1/expressions/pratt";

describe("metabase-lib/v1/expressions/parser", () => {
  interface AST {
    token: string;
    children: AST[];
    pos: number;
  }
  function cleanupAST(node: Node): AST {
    return {
      token: node.token?.text || "UNKNOWN",
      children: node.children.map(cleanupAST),
      pos: node.token?.pos || -1,
    };
  }

  function parseExpression(source: string, throwOnError: boolean = true) {
    return cleanupAST(
      parse(lexify(source), {
        throwOnError,
      }).root,
    );
  }

  const parseAggregation = parseExpression;
  const parseFilter = parseExpression;

  describe("Handles crazy expressions", () => {
    it("Seed 66120", () => {
      const expr = `(Z8YZP(_1(- CW(182751, (_d_YU_((h3M_))), 0e31, 0) > _d((0e+96) >= [UVz], NOT ltKvh([__7g], (\"85\")) / - (D___(h627I1 (50106.e80, Qh8_U(([B] = \"d9 \"), 586107.E1 OR [__42 → G_TH]), [Cc_]) + 22882e+22, \"ws\" * 642705.632614e+47, - _2Y_nZi + - __k1_q_(((519470.E+61)), [D]) >= (0E20), [__1sCC3 → mz8])), (M(Q4__L(), (NOT NOT NOT NOT - \"g\" + NOT 0e+35))) <= 798469.324524E54)), h((- R8__K), T6([f3w67], NOT [D8d2933])), ftI7YA(0E+10 <= [F1Y_ → tuj] * 907239. = (NOT O1sW7pq((631184.576387e+12 > _H___3B(- [v_h_4])) != - z) <= ([_EvzL_8 → Ar]) <= [e1_Jy57]) AND _u2_(252719, \" 9\"), __(hB(NOT \"7j 1_V_\", 660445E+96, (x0E9ox(k__p(_9h5_() AND e(\"70_f\", __2_S_Q()) + [__W6U → L7UnD6J] = (NOT NOT N(h_9(\"4 g \", 575068.), NOT \"487\", [S → yWQ_], (\"  \" + \" k_ dd2d \"))), (TMIVF(\"c\", - [_gx3sJ → g___5j], (559929.E66))), - [jUc_y → o7], p84__t8((((Mg8_()))), - [ZF59_w8 → U], - [T_ → gw_2k3] OR (848268.635035E+38 * (20814.e-38)), P_7_0 <= y09(C3_(399920), Lw_O(- 252450.180012e-81 = 290101.992467, 71543.409973E65, A((_()), H(858127., 1, \"_W D\", \" __\"), - 253307.244574e21, [IZ_Q_D])), _q(\"_ _\"), rRa2) > Q(_1Ux0, NOT K__j89, - (V_7IS), \"_n58\"))))) - 719454), sq_R(), 346932., NOT B___())), - 787799.)) < \"712\"`;
      expect(() => parseExpression(expr)).not.toThrow();
    });

    it("Seed 635496", () => {
      const expr = `K__(m_AA(yyg6_t((NOT [XH8]), [W → PU]) > [k8xNd3 → md_zfIs] + a9_H9MP, a___tf(p_G(- C_Ug((_5iP), (vh_) > _zaS_, 578833.e+0 = ([_9S_64] <= C_(t53I, Q_6(NOT MO_B(0, NOT K61p_f)))))), (866983.)), __E(_W7a_, oXm7A(_01E_(627139.300685 > NOT u_1_d6(p4564j1(gZfe_9((- 727986.), p7hU()) * - - U2w_k9_(0, 1, \"69 a\", \" \"), _129)) <= NOT \"k_K\", - (_chTf5V() AND E3_(u_X2_, (NOT qImu5()), 955004) = ZQcm <= 96160.580572), 904595.), 46320.407574E+99) > [hXw → H_KD], NOT 126223.561027, (C_I92O) OR (NOT Je5_C([UvO_b1 → _i_S], 0, 647472E+81 != - __(), 920107.)) != (NOT f(68493., 335976.415413 > (1))) != _(_y(\"___\", [___u_L], [_w], [ODVlD → nM])) > \"Qq \"), ((\"7\") * 754944.E85)) >= (- XzB__(t1782, (\"r_\") <= \"__wa\") AND - 107898.37690E+16)) = (NOT [J_ → _])`;
      expect(() => parseExpression(expr)).not.toThrow();
    });

    it("Seed 59999", () => {
      const expr = `_z * NOT 0 = TS(__O_v2_(_t(- (- Y_), (NOT _27a != NOT T80Bm67((20804.), 664158.926033 AND [B82PH_], - NOT (891819 < \"a_wf_DI\") - 731090. >= 1 <= ((_g0AC(867927E+79)) <= \"_P \" = 990643.), ([yL4P_0 → _])) >= gn7_19(0 AND um6(((((202340.)))), NOT \"P\", (0 + - \"_l4k3\" = (_HG7_B(\"8t5_s _O2\", 1, \"Y_d_\", 0)))), [L2_], NOT 648865.E73, - - (355186e+44)))), [_G], [__Z → G_U9], NOT (NOT 756239.969634E-67 = ((_baX_r())) + ((NOT - [Q4 → pB]))) AND f__ErS(766747, [hc0y → sjA_h], [_ → v7__kJ1] * (D1_n18(_2B(1))) AND NOT u7(vj__) OR 847581, NOT (1e+5))), \"WZztF\")`;
      expect(() => parseExpression(expr)).not.toThrow();
    });
  });

  describe("handles fields", () => {
    // ---- Negation - number ----
    it("should accept a field", () => {
      expect(() => parseExpression("[A]")).not.toThrow();
    });
    it("should accept a negative field", () => {
      expect(() => parseExpression("-[A]")).not.toThrow();
    });

    it("should accept a field with escaped parentheses", () => {
      expect(() => parseExpression("[A \\(B\\)]")).not.toThrow();
    });

    it("should accept an escaped field", () => {
      expect(() => parseExpression("[A \\[T\\]]")).not.toThrow();
    });
  });

  describe("handles negation", () => {
    // ---- Negation - number ----
    it("should accept a negative number", () => {
      expect(() => parseExpression("-42")).not.toThrow();
    });
    it("should accept a negative number (outside parentheses)", () => {
      expect(() => parseExpression("-(42)")).not.toThrow();
    });
    it("should accept a negative number (inside parentheses)", () => {
      expect(() => parseExpression("(-42)")).not.toThrow();
    });

    // ---- Negation - identifier ----
    it("should accept a negative identifier", () => {
      expect(() => parseExpression("-[X]")).not.toThrow();
    });
    it("should accept a negative identifier (outside parentheses)", () => {
      expect(() => parseExpression("-([X])")).not.toThrow();
    });
    it("should accept a negative identifier (inside parentheses)", () => {
      expect(() => parseExpression("(-[X])")).not.toThrow();
    });

    // ---- Negation - identifier ----
    it("should accept a negative function call", () => {
      expect(() => parseExpression("-abs([X])")).not.toThrow();
    });
    it("should accept a negative function call (outside parentheses)", () => {
      expect(() => parseExpression("-(abs([X]))")).not.toThrow();
    });
    it("should accept a negative function call (inside parentheses)", () => {
      expect(() => parseExpression("(-abs([X]))")).not.toThrow();
    });

    /// ---- Other weird negations ----
    it("should accept a double negation with syntax error", () => {
      expect(() => parseExpression("NOT NOT Or", false)).not.toThrow();
    });
  });

  describe("(in expression mode)", () => {
    it("should accept a number", () => {
      expect(() => parseExpression("42")).not.toThrow();
    });
    it("should accept a single-quoted string", () => {
      expect(() => parseExpression("'Answer'")).not.toThrow();
    });
    it("should accept an escaped single-quoted string", () => {
      expect(() => parseExpression("'An\\'swer'")).not.toThrow();
    });
    it("should accept a double-quoted string", () => {
      expect(() => parseExpression('"Answer"')).not.toThrow();
    });
    it("should accept an escaped double-quoted string", () => {
      expect(() => parseExpression('"An\\"swer"')).not.toThrow();
    });
    it("should accept a group expression (in parentheses)", () => {
      expect(() => parseExpression("(42)")).not.toThrow();
    });

    it("should accept the function lower", () => {
      expect(() => parseExpression("Lower([Title])")).not.toThrow();
    });
    it("should accept the function upper", () => {
      expect(() => parseExpression("Upper([Title])")).not.toThrow();
    });
    it("should accept the function now", () => {
      expect(() => parseExpression("now")).not.toThrow();
    });

    it("should accept the function CASE", () => {
      expect(() => parseExpression("Case([Z]>7, 'X', 'Y')")).not.toThrow();
    });
    it("should accept the function CASE with multiple cases", () => {
      expect(() => parseExpression("Case([X]>5,5,[X]>3,3,0)")).not.toThrow();
    });

    it("should reject an unclosed single-quoted string", () => {
      expect(() => parseExpression('"Answer')).toThrow();
    });
    it("should reject an unclosed double-quoted string", () => {
      expect(() => parseExpression('"Answer')).toThrow();
    });
    it("should reject a mismatched quoted string", () => {
      expect(() => parseExpression("\"Answer'")).toThrow();
    });
    it("should handle a conditional with ISEMPTY", () => {
      expect(() =>
        parseExpression("case(isempty([Discount]),[P])"),
      ).not.toThrow();
    });
    it("should accept CASE with two arguments", () => {
      expect(() => parseExpression("case([Deal],x)")).not.toThrow();
    });
    it("should reject CASE missing a closing paren", () => {
      expect(() => parseExpression("case([Deal],x")).toThrow();
    });
  });

  describe("(in aggregation mode)", () => {
    it("should accept an aggregration with COUNT", () => {
      expect(() => parseAggregation("Count()")).not.toThrow();
    });
    it("should accept an aggregration with SUM", () => {
      expect(() => parseAggregation("Sum([Price])")).not.toThrow();
    });
    it("should accept an aggregration with DISTINCT", () => {
      expect(() => parseAggregation("Distinct([Supplier])")).not.toThrow();
    });
    it("should accept an aggregration with STANDARDDEVIATION", () => {
      expect(() => parseAggregation("StandardDeviation([Debt])")).not.toThrow();
    });
    it("should accept an aggregration with AVERAGE", () => {
      expect(() => parseAggregation("Average([Height])")).not.toThrow();
    });
    it("should accept an aggregration with MAX", () => {
      expect(() => parseAggregation("Max([Discount])")).not.toThrow();
    });
    it("should accept an aggregration with MIN", () => {
      expect(() => parseAggregation("Min([Rating])")).not.toThrow();
    });
    it("should accept an aggregration with MEDIAN", () => {
      expect(() => parseAggregation("Median([Total])")).not.toThrow();
    });
    it("should accept an aggregration with VAR", () => {
      expect(() => parseAggregation("Variance([Tax])")).not.toThrow();
    });

    it("should accept a conditional aggregration with COUNTIF", () => {
      expect(() => parseAggregation("CountIf([Discount] > 0)")).not.toThrow();
    });

    it("should accept a conditional aggregration with COUNTIF containing an expression", () => {
      expect(() => parseAggregation("CountIf(([A]+[B]) > 1)")).not.toThrow();
      expect(() =>
        parseAggregation("CountIf( 1.2 * [Price] > 37)"),
      ).not.toThrow();
    });
  });

  describe("(in filter mode)", () => {
    it("should accept a simple comparison", () => {
      expect(() => parseFilter("[Total] > 12")).not.toThrow();
    });
    it("should accept another simple comparison", () => {
      expect(() => parseFilter("10 < [DiscountPercent]")).not.toThrow();
    });
    it("should accept a logical NOT", () => {
      expect(() => parseFilter("NOT [Debt] > 5")).not.toThrow();
    });
    it("should accept a segment", () => {
      expect(() => parseFilter("[SpecialDeal]")).not.toThrow();
    });
    it("should accept a logical NOT on segment", () => {
      expect(() => parseFilter("NOT [Clearance]")).not.toThrow();
    });
    it("should accept multiple logical NOTs on segment", () => {
      expect(() => parseFilter("NOT NOT [Clearance]")).not.toThrow();
    });
    it("should accept a relational between a segment and a dimension", () => {
      expect(() => parseFilter("([Shipping] < 2) AND [Sale]")).not.toThrow();
    });
    it("should accept parenthesized logical operations", () => {
      expect(() => parseFilter("([Deal] AND [HighRating])")).not.toThrow();
      expect(() => parseFilter("([Price] < 100 OR [Refurb])")).not.toThrow();
    });
    it("should accept a function", () => {
      expect(() => parseFilter("between([Subtotal], 1, 2)")).not.toThrow();
    });
  });
});
