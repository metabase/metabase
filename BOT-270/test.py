import unittest
from run_benchmark import is_search_result_relevant, precision_at_k, hit_rate_at_k, reciprocal_rank


class TestQualityMetrics(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures with sample data"""
        # Sample relevant items that we're looking for
        self.relevant_items = [
            {"id": 1, "name": "Dashboard A"},
            {"id": 2, "name": "Question B"},
            {"id": 3, "name": "Card C"}
        ]
        
        # Sample search results with mix of relevant and irrelevant items
        self.result_objects = [
            {"id": 1, "name": "Dashboard A", "type": "dashboard"},
            {"id": 4, "name": "Dashboard D", "type": "dashboard"},
            {"id": 2, "name": "Question B", "type": "card"},
            {"id": 5, "name": "Question E", "type": "card"},
            {"id": 6, "name": "Dashboard F", "type": "dashboard"}
        ]


class TestIsSearchResultRelevant(TestQualityMetrics):
    
    def test_exact_match_is_relevant(self):
        """Test that exact matches are considered relevant"""
        result_obj = {"id": 1, "name": "Dashboard A"}
        relevant_items = [{"id": 1, "name": "Dashboard A"}]
        self.assertTrue(is_search_result_relevant(result_obj, relevant_items))
    
    def test_partial_match_is_relevant(self):
        """Test that partial matches are considered relevant"""
        result_obj = {"id": 1, "name": "Dashboard A", "type": "dashboard"}
        relevant_items = [{"id": 1, "name": "Dashboard A"}]  # missing 'type' key
        self.assertTrue(is_search_result_relevant(result_obj, relevant_items))
    
    def test_no_match_is_not_relevant(self):
        """Test that non-matches are not considered relevant"""
        result_obj = {"id": 4, "name": "Dashboard D"}
        relevant_items = [{"id": 1, "name": "Dashboard A"}]
        self.assertFalse(is_search_result_relevant(result_obj, relevant_items))
    
    def test_wrong_id_is_not_relevant(self):
        """Test that wrong id makes result not relevant"""
        result_obj = {"id": 4, "name": "Dashboard A"}
        relevant_items = [{"id": 1, "name": "Dashboard A"}]
        self.assertFalse(is_search_result_relevant(result_obj, relevant_items))
    
    def test_missing_key_in_result_is_not_relevant(self):
        """Test that missing required key in result makes it not relevant"""
        result_obj = {"name": "Dashboard A"}  # missing 'id' key
        relevant_items = [{"id": 1, "name": "Dashboard A"}]
        self.assertFalse(is_search_result_relevant(result_obj, relevant_items))
    
    def test_multiple_relevant_items(self):
        """Test matching against multiple relevant items"""
        result_obj = {"id": 2, "name": "Question B"}
        relevant_items = [
            {"id": 1, "name": "Dashboard A"},
            {"id": 2, "name": "Question B"},
            {"id": 3, "name": "Card C"}
        ]
        self.assertTrue(is_search_result_relevant(result_obj, relevant_items))
    
    def test_empty_relevant_items(self):
        """Test behavior with empty relevant items list"""
        result_obj = {"id": 1, "name": "Dashboard A"}
        relevant_items = []
        self.assertFalse(is_search_result_relevant(result_obj, relevant_items))


class TestPrecisionAtK(TestQualityMetrics):
    
    def test_perfect_precision(self):
        """Test precision when all top-k results are relevant"""
        # Use the same items as both relevant and results for perfect precision
        result = precision_at_k(self.relevant_items, self.relevant_items, k=2)
        self.assertEqual(result, 1.0)  # 2/2 = 1.0
    
    def test_half_precision(self):
        """Test precision when half of top-k results are relevant"""
        # First 4 results: 2 relevant, 2 not relevant
        result = precision_at_k(self.relevant_items, self.result_objects, k=4)
        self.assertEqual(result, 0.5)  # 2/4 = 0.5
    
    def test_zero_precision(self):
        """Test precision when no top-k results are relevant"""
        # Only look at positions 1 and 3 (0-indexed), which are not relevant
        non_relevant_results = [
            {"id": 4, "name": "Dashboard D"},
            {"id": 5, "name": "Question E"}
        ]
        result = precision_at_k(self.relevant_items, non_relevant_results, k=2)
        self.assertEqual(result, 0.0)
    
    def test_k_larger_than_results(self):
        """Test precision when k is larger than number of results"""
        # Only 2 results, but k=5
        short_results = [
            {"id": 1, "name": "Dashboard A"},
            {"id": 4, "name": "Dashboard D"}
        ]
        result = precision_at_k(self.relevant_items, short_results, k=5)
        self.assertEqual(result, 0.2)  # 1/5 = 0.2 (only 1 relevant out of k=5)
    
    def test_empty_results(self):
        """Test precision with empty results"""
        result = precision_at_k(self.relevant_items, [], k=5)
        self.assertEqual(result, 0.0)
    
    def test_zero_k(self):
        """Test precision with k=0"""
        result = precision_at_k(self.relevant_items, self.result_objects, k=0)
        self.assertEqual(result, 0.0)
    
    def test_negative_k(self):
        """Test precision with negative k"""
        result = precision_at_k(self.relevant_items, self.result_objects, k=-1)
        self.assertEqual(result, 0.0)


class TestHitRateAtK(TestQualityMetrics):
    
    def test_hit_at_first_position(self):
        """Test hit rate when first result is relevant"""
        result = hit_rate_at_k(self.relevant_items, self.result_objects, k=1)
        self.assertEqual(result, 1.0)
    
    def test_hit_in_top_k(self):
        """Test hit rate when at least one result in top-k is relevant"""
        # Even though position 1 is not relevant, position 0 and 2 are
        result = hit_rate_at_k(self.relevant_items, self.result_objects, k=3)
        self.assertEqual(result, 1.0)
    
    def test_no_hit_in_top_k(self):
        """Test hit rate when no results in top-k are relevant"""
        non_relevant_results = [
            {"id": 4, "name": "Dashboard D"},
            {"id": 5, "name": "Question E"},
            {"id": 6, "name": "Dashboard F"}
        ]
        result = hit_rate_at_k(self.relevant_items, non_relevant_results, k=3)
        self.assertEqual(result, 0.0)
    
    def test_hit_at_exact_k(self):
        """Test hit rate when relevant result is at position k"""
        # Relevant result is at position 2 (0-indexed), so k=3 should include it
        result = hit_rate_at_k(self.relevant_items, self.result_objects, k=3)
        self.assertEqual(result, 1.0)
        
        # But k=2 should also include it since there's a relevant result at position 0
        result = hit_rate_at_k(self.relevant_items, self.result_objects, k=2)
        self.assertEqual(result, 1.0)
    
    def test_empty_results(self):
        """Test hit rate with empty results"""
        result = hit_rate_at_k(self.relevant_items, [], k=5)
        self.assertEqual(result, 0.0)
    
    def test_zero_k(self):
        """Test hit rate with k=0"""
        result = hit_rate_at_k(self.relevant_items, self.result_objects, k=0)
        self.assertEqual(result, 0.0)
    
    def test_negative_k(self):
        """Test hit rate with negative k"""
        result = hit_rate_at_k(self.relevant_items, self.result_objects, k=-1)
        self.assertEqual(result, 0.0)


class TestReciprocalRank(TestQualityMetrics):
    
    def test_first_position_relevance(self):
        """Test reciprocal rank when first result is relevant"""
        # First result is relevant, so RR = 1/1 = 1.0
        result = reciprocal_rank(self.relevant_items, self.result_objects)
        self.assertEqual(result, 1.0)
    
    def test_second_position_relevance(self):
        """Test reciprocal rank when first relevant result is at position 2"""
        # Move relevant result to second position (0-indexed position 1)
        reordered_results = [
            {"id": 4, "name": "Dashboard D"},      # not relevant
            {"id": 1, "name": "Dashboard A"},      # relevant at position 1 (rank 2)
            {"id": 5, "name": "Question E"},       # not relevant  
            {"id": 2, "name": "Question B"},       # relevant
        ]
        result = reciprocal_rank(self.relevant_items, reordered_results)
        self.assertEqual(result, 0.5)  # 1/2 = 0.5
    
    def test_third_position_relevance(self):
        """Test reciprocal rank when first relevant result is at position 3"""
        reordered_results = [
            {"id": 4, "name": "Dashboard D"},      # not relevant
            {"id": 5, "name": "Question E"},       # not relevant
            {"id": 1, "name": "Dashboard A"},      # relevant at position 2 (rank 3)
            {"id": 2, "name": "Question B"},       # relevant
        ]
        result = reciprocal_rank(self.relevant_items, reordered_results)
        self.assertAlmostEqual(result, 1/3, places=6)  # 1/3 ≈ 0.333333
    
    def test_no_relevant_results(self):
        """Test reciprocal rank when no results are relevant"""
        non_relevant_results = [
            {"id": 4, "name": "Dashboard D"},
            {"id": 5, "name": "Question E"},
            {"id": 6, "name": "Dashboard F"}
        ]
        result = reciprocal_rank(self.relevant_items, non_relevant_results)
        self.assertEqual(result, 0.0)
    
    def test_empty_results(self):
        """Test reciprocal rank with empty results"""
        result = reciprocal_rank(self.relevant_items, [])
        self.assertEqual(result, 0.0)
    
    def test_multiple_relevant_results(self):
        """Test that reciprocal rank only considers first relevant result"""
        # Multiple relevant results, but should only use the first one
        multiple_relevant = [
            {"id": 4, "name": "Dashboard D"},      # not relevant
            {"id": 2, "name": "Question B"},       # relevant at position 1 (rank 2)
            {"id": 1, "name": "Dashboard A"},      # relevant at position 2 (rank 3) - ignored
            {"id": 3, "name": "Card C"}            # relevant at position 3 (rank 4) - ignored
        ]
        result = reciprocal_rank(self.relevant_items, multiple_relevant)
        self.assertEqual(result, 0.5)  # 1/2 = 0.5 (only first relevant result matters)


class TestEdgeCases(TestQualityMetrics):
    
    def test_empty_relevant_items(self):
        """Test all functions with empty relevant items"""
        empty_relevant = []
        
        # All should return 0 when there are no relevant items to find
        self.assertEqual(precision_at_k(empty_relevant, self.result_objects, k=3), 0.0)
        self.assertEqual(hit_rate_at_k(empty_relevant, self.result_objects, k=3), 0.0)
        self.assertEqual(reciprocal_rank(empty_relevant, self.result_objects), 0.0)
    
    def test_single_item_lists(self):
        """Test functions with single item lists"""
        single_relevant = [{"id": 1, "name": "Dashboard A"}]
        single_result = [{"id": 1, "name": "Dashboard A"}]
        
        self.assertEqual(precision_at_k(single_relevant, single_result, k=1), 1.0)
        self.assertEqual(hit_rate_at_k(single_relevant, single_result, k=1), 1.0)
        self.assertEqual(reciprocal_rank(single_relevant, single_result), 1.0)
    
    def test_large_k_values(self):
        """Test functions with k values much larger than result set"""
        k_large = 100
        
        # Should still work correctly
        precision = precision_at_k(self.relevant_items, self.result_objects, k=k_large)
        self.assertEqual(precision, 2/100)  # 2 relevant out of k=100
        
        hit_rate = hit_rate_at_k(self.relevant_items, self.result_objects, k=k_large)
        self.assertEqual(hit_rate, 1.0)  # Still found relevant results


if __name__ == '__main__':
    unittest.main()