import 'babel-polyfill';
import 'number-to-locale-string';
import "metabase/css/index.css";

window.MetabaseBootstrap = {
    timezones: [
        "GMT",
        "UTC",
        "US\/Alaska",
        "US\/Arizona",
        "US\/Central",
        "US\/Eastern",
        "US\/Hawaii",
        "US\/Mountain",
        "US\/Pacific",
        "America\/Costa_Rica"
    ],
    types: {
        "type/Address":                   ["type/*"],
        "type/Array":                     ["type/Collection"],
        "type/AvatarURL":                 ["type/URL"],
        "type/BigInteger":                ["type/Integer"],
        "type/Boolean":                   ["type/*"],
        "type/Category":                  ["type/Special"],
        "type/City":                      ["type/Category", "type/Address", "type/Text"],
        "type/Collection":                ["type/*"],
        "type/Coordinate":                ["type/Float"],
        "type/Country":                   ["type/Category", "type/Address", "type/Text"],
        "type/Date":                      ["type/DateTime"],
        "type/DateTime":                  ["type/*"],
        "type/Decimal":                   ["type/Float"],
        "type/Description":               ["type/Text"],
        "type/Dictionary":                ["type/Collection"],
        "type/FK":                        ["type/Special"],
        "type/Float":                     ["type/Number"],
        "type/IPAddress":                 ["type/TextLike"],
        "type/ImageURL":                  ["type/URL"],
        "type/Integer":                   ["type/Number"],
        "type/Latitude":                  ["type/Coordinate"],
        "type/Longitude":                 ["type/Coordinate"],
        "type/Name":                      ["type/Category", "type/Text"],
        "type/Number":                    ["type/*"],
        "type/PK":                        ["type/Special"],
        "type/SerializedJSON":            ["type/Text", "type/Collection"],
        "type/Special":                   ["type/*"],
        "type/State":                     ["type/Category", "type/Address", "type/Text"],
        "type/Text":                      ["type/*"],
        "type/TextLike":                  ["type/*"],
        "type/Time":                      ["type/DateTime"],
        "type/UNIXTimestamp":             ["type/Integer", "type/DateTime"],
        "type/UNIXTimestampMilliseconds": ["type/UNIXTimestamp"],
        "type/UNIXTimestampSeconds":      ["type/UNIXTimestamp"],
        "type/URL":                       ["type/Text"],
        "type/UUID":                      ["type/Text"],
        "type/ZipCode":                   ["type/Integer", "type/Address"]
    }
};
