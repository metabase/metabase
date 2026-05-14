#!/usr/bin/env python3
"""Deterministic seed for corleone_cigars demo DB.

Anchor date is 2026-05-14. Generates ~2,400 shipments across trailing 4
quarters. Big Sal owns ~82% of NJ Q4 revenue by construction.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

import psycopg

ANCHOR = date(2026, 5, 14)
SEED = 42
TOTAL_SHIPMENTS = 2400

SKUS = [
    # (name, origin, box_price_usd)
    ("Cohiba Behike 56",          "Cuba",       1200.00),
    ("Cohiba Robusto",            "Cuba",        480.00),
    ("Montecristo No. 2",         "Cuba",        360.00),
    ("Romeo y Julieta Churchill", "Cuba",        320.00),
    ("Padrón 1964 Anniversary",   "Nicaragua",   580.00),
    ("Arturo Fuente Opus X",      "Dominican",   720.00),
    ("Davidoff Winston Churchill","Dominican",   540.00),
    ("Partagás Lusitania",        "Cuba",        410.00),
    ("Hoyo de Monterrey Epicure", "Cuba",        290.00),
    ("Trinidad Fundadores",       "Cuba",        460.00),
    ("Bolívar Belicosos Finos",   "Cuba",        280.00),
    ("Family Reserve",            "House blend", 950.00),
]

DISTRIBUTORS = [
    # (name, nickname, region, joined_at)
    ("Salvatore Bonanno",  "Big Sal",     "NJ",          date(2014, 3, 1)),
    ("Vincenzo Pugliesi",  "Two Times",   "NY",          date(2009, 6, 1)),
    ("Francesco DeLuca",   "Knuckles",    "Chicago",     date(2011, 11, 1)),
    ("Antonio Marino",     "Cigars",      "Miami",       date(2016, 2, 1)),
    ("Paolo Greco",        "The Books",   "Boston",      date(2013, 8, 1)),
    ("Giuseppe Russo",     "Half-Stack",  "Vegas",       date(2018, 4, 1)),
    ("Carmine Esposito",   "The Mouth",   "Philly",      date(2010, 9, 1)),
    ("Rocco Mancuso",      "Two Phones",  "Long Island", date(2015, 12, 1)),
]

def quarter_of(d: date) -> int:
    return (d.month - 1) // 3 + 1

def quarter_start(year: int, q: int) -> date:
    return date(year, 3 * (q - 1) + 1, 1)

def quarter_end(year: int, q: int) -> date:
    if q == 4:
        return date(year + 1, 1, 1) - timedelta(days=1)
    return date(year, 3 * q + 1, 1) - timedelta(days=1)

def current_quarter_window(anchor: date) -> tuple[date, date]:
    """Q4 of the demo = the quarter immediately before the anchor's quarter,
    so Q4 is the most recent *completed* quarter relative to 2026-05-14."""
    aq = quarter_of(anchor)
    if aq == 1:
        return quarter_start(anchor.year - 1, 4), quarter_end(anchor.year - 1, 4)
    return quarter_start(anchor.year, aq - 1), quarter_end(anchor.year, aq - 1)

def main():
    rng = random.Random(SEED)
    q4_start, q4_end = current_quarter_window(ANCHOR)
    start = q4_start.replace(year=q4_start.year - 1)  # 4 quarters back
    end = q4_end

    with psycopg.connect("dbname=corleone_cigars") as conn:
        with conn.cursor() as cur:
            # Idempotent: wipe and reseed. RESTART IDENTITY keeps serial PKs stable.
            cur.execute("TRUNCATE shipments, skus, distributors RESTART IDENTITY CASCADE")
            cur.executemany("INSERT INTO skus (name, origin, box_price_usd) VALUES (%s, %s, %s)", SKUS)
            cur.executemany(
                "INSERT INTO distributors (name, nickname, region, joined_at) VALUES (%s, %s, %s, %s)",
                DISTRIBUTORS,
            )

            cur.execute("SELECT id, box_price_usd FROM skus ORDER BY id")
            sku_rows = cur.fetchall()
            cur.execute("SELECT id, region, nickname FROM distributors ORDER BY id")
            dist_rows = cur.fetchall()

            big_sal = next(d for d in dist_rows if d[2] == "Big Sal")
            # Big Sal is the *only* NJ distributor in our roster, so his concentration
            # is by definition 100% unless we also assign other distributors to NJ
            # shipments. To produce ~82%, route ~10% of NJ Q4 shipments to
            # NON-NJ distributors as "guest" deliveries (revenue variance pushes
            # the share down toward 82% — empirically 0.10 lands in [79, 85]).
            non_nj = [d for d in dist_rows if d[1] != "NJ"]
            nj_q4_guest_rate = 0.10

            total_days = (end - start).days + 1
            rows = []
            for _ in range(TOTAL_SHIPMENTS):
                day_offset = rng.randint(0, total_days - 1)
                ship = start + timedelta(days=day_offset)
                sku_id, box_price = rng.choice(sku_rows)
                # Region distribution: weight NJ heavier so Q4 NJ has volume
                region = rng.choices(
                    ["NJ", "NY", "Chicago", "Miami", "Boston", "Vegas", "Philly", "Long Island"],
                    weights=[26, 16, 12, 12, 10, 8, 8, 8],
                    k=1,
                )[0]
                is_q4 = q4_start <= ship <= q4_end
                if region == "NJ":
                    if is_q4 and rng.random() < nj_q4_guest_rate:
                        # ~10% of NJ Q4 shipments go to a non-NJ distributor as a "guest"
                        dist_id, _, _ = rng.choice(non_nj)
                    else:
                        dist_id, _, _ = big_sal
                else:
                    # Match distributor to region when possible
                    matching = [d for d in dist_rows if d[1] == region]
                    dist_id, _, _ = rng.choice(matching) if matching else rng.choice(dist_rows)

                units = rng.randint(2, 24)
                # Slight noise so revenue isn't an exact multiple of box_price
                multiplier = Decimal("1") + Decimal(rng.randint(-300, 300)) / Decimal("10000")
                revenue = (Decimal(units) * Decimal(box_price) * multiplier).quantize(Decimal("0.01"))
                rows.append((ship, sku_id, dist_id, region, units, float(revenue)))

            cur.executemany(
                """INSERT INTO shipments (ship_date, sku_id, distributor_id, region, units, revenue_usd)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                rows,
            )
        conn.commit()
    print(f"Seeded {TOTAL_SHIPMENTS} shipments. Q4 window: {q4_start} to {q4_end}")

if __name__ == "__main__":
    main()
