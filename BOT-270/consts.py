DOC_STRING_CURRENT = """\
┌──── METRICS ────────────────────────────────────────────────────────────┐

► precision@K
   ├─ ƒ = (# relevant in top K results) / K
   └─ Fraction of top K results that are useful.

► hit@k
   ├─ (# queries with ≥1 relevant result in top K) / (total # queries)  
   └─ How often you avoid complete failure.

► Mean Reciprocal Rank (MRR)
   ├─ (1/N) × Σ(1/rank_of_first_relevant_result)
   └─ Average scroll distance to first useful result.

└─────────────────────────────────────────────────────────────────────────┘
"""

DOC_STRING = """\
┌──── METRICS ────────────────────────────────────────────────────────────┐

► precision@K
   ├─ ƒ = (# relevant in top K results) / K
   └─ Fraction of top K results that are useful.

► recall@K
   ├─ (# relevant in top K results) / (total # relevant items)
   └─ Fraction of all relevant items found in top K.

► hit@k
   ├─ (# queries with ≥1 relevant result in top K) / (total # queries)  
   └─ How often you avoid complete failure.

► Mean Reciprocal Rank (MRR)
   ├─ (1/N) × Σ(1/rank_of_first_relevant_result)
   └─ Average scroll distance to first useful result.

► Mean Average Precision (MAP)  
   ├─ (1/N) × Σ(AP_query) where AP = (1/R) × Σ(Precision@k × relevance_k)
   └─ Overall ranking quality for all relevant results.

► Normalized Discounted Cumulative Gain (NDCG@K)
   ├─ DCG@K / IDCG@K where DCG = Σ((2^relevance - 1) / log₂(rank + 1))
   └─ Ranking quality emphasizing top positions, graded relevance.

└─────────────────────────────────────────────────────────────────────────┘
"""