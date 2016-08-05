export default {
  "padding": {"top": 10, "left": 40, "bottom": 20, "right": 10},

  "signals": [
    {
      "name": "tooltip",
      "init": {},
      "streams": [
        {"type": "rect:mouseover", "expr": "datum"},
        {"type": "rect:mouseout", "expr": "{}"}
      ]
    }
  ],

  "predicates": [
    {
      "name": "tooltip", "type": "==",
      "operands": [{"signal": "tooltip._id"}, {"arg": "id"}]
    }
  ],

  "scales": [
    { "name": "xscale", "type": "ordinal", "range": "width",
      "domain": {"data": "table0", "field": "field0"} },
    { "name": "yscale", "range": "height", "nice": true,
      "domain": {"data": "table0", "field": "field1"} }
  ],

  "axes": [
    { "type": "x", "scale": "xscale" },
    { "type": "y", "scale": "yscale" }
  ],

  "marks": [
    {
      "type": "rect",
      "from": {"data":"table0"},
      "properties": {
        "enter": {
          "x": {"scale": "xscale", "field": "field0"},
          "width": {"scale": "xscale", "band": true, "offset": -1},
          "y": {"scale": "yscale", "field": "field1"},
          "y2": {"scale": "yscale", "value":0}
        },
        "update": { "fill": {"value": "steelblue"} },
        "hover": { "fill": {"value": "red"} }
      }
    },
    {
      "type": "text",
      "properties": {
        "enter": {
          "align": {"value": "center"},
          "fill": {"value": "#333"}
        },
        "update": {
          "x": {"scale": "xscale", "signal": "tooltip.field0"},
          "dx": {"scale": "xscale", "band": true, "mult": 0.5},
          "y": {"scale": "yscale", "signal": "tooltip.field1", "offset": -5},
          "text": {"signal": "tooltip.field1"},
          "fillOpacity": {
            "rule": [
              {
                "predicate": {"name": "tooltip", "id": {"value": null}},
                "value": 0
              },
              {"value": 1}
            ]
          }
        }
      }
    }
  ]
};
