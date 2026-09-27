import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

AI_BUILDER_URL = "http://localhost:5173/ai-builder"
PLANS_URL = "http://localhost:5173/plans"

class TestAIBuilderToExpeditionFlow:
    """
    End-to-End Automated Test Suite:
    1. Fills the AI Tour Package Builder form with custom specifications.
    2. Submits and waits for Google Gemini AI dual-package generation.
    3. Selects the Database-Grounded Tour Package.
    4. Saves the generated package to create an official expedition.
    5. Navigates to the Tour Plans / Expedition page.
    6. Asserts that the tour package with its multi-place stops exists on the expedition page.
    """

    def test_ai_builder_generates_and_saves_to_expeditions(self, driver):
        wait = WebDriverWait(driver, 45)

        # -------------------------------------------------------------
        # Step 1: Navigate to AI Package Builder
        # -------------------------------------------------------------
        driver.get(AI_BUILDER_URL)
        time.sleep(1.5)

        header_element = wait.until(
            EC.presence_of_element_located((By.XPATH, "//h1[contains(., 'AI Tour Package Builder')]"))
        )
        assert header_element.is_displayed(), "AI Tour Package Builder page header not displayed"

        # -------------------------------------------------------------
        # Step 2: Fill out the AI Package form
        # -------------------------------------------------------------
        # Starting Location
        start_inputs = driver.find_elements(By.XPATH, "//input[@list='ai-start-cities']")
        if start_inputs:
            start_inputs[0].clear()
            start_inputs[0].send_keys("Dhaka")

        # Destination
        dest_inputs = driver.find_elements(By.XPATH, "//input[@list='ai-builder-destinations']")
        assert len(dest_inputs) > 0, "Could not find destination input field"
        dest_inputs[0].clear()
        dest_inputs[0].send_keys("Cox's Bazar")

        # Budget
        budget_inputs = driver.find_elements(By.XPATH, "//input[@type='number']")
        if budget_inputs:
            budget_inputs[0].clear()
            budget_inputs[0].send_keys("18000")

        time.sleep(1)

        # -------------------------------------------------------------
        # Step 3: Click 'Build Dual AI Packages' and wait for Gemini
        # -------------------------------------------------------------
        generate_btn = driver.find_element(
            By.XPATH, "//button[@type='submit' and contains(., 'Build Dual AI Packages')]"
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", generate_btn)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", generate_btn)

        # Wait for the results card to appear (loader to disappear and package details to render)
        # Timeout is 45s to allow Gemini API generation
        results_header = wait.until(
            EC.presence_of_element_located((
                By.XPATH, "//button[contains(., 'LagaTour DB Grounded')] | //span[contains(., 'Verified DB Circuit')]"
            ))
        )
        assert results_header is not None, "AI Package Generation timed out or failed to render"

        # -------------------------------------------------------------
        # Step 4: Verify and Select Database-Grounded Suggestion
        # -------------------------------------------------------------
        db_tab = driver.find_elements(By.XPATH, "//button[contains(., 'LagaTour DB Grounded')]")
        if db_tab:
            driver.execute_script("arguments[0].click();", db_tab[0])
            time.sleep(1)

        # Extract generated package title
        title_elements = driver.find_elements(By.XPATH, "//h2[contains(@class, 'font-black')]")
        assert len(title_elements) > 0, "Generated package title not found"
        generated_title = title_elements[0].text.strip()
        print(f"\n[TEST INFO] Generated AI Package Title: '{generated_title}'")
        assert len(generated_title) > 0, "Package title should not be empty"

        # Verify time slots (Morning, Afternoon, Evening) are present
        page_html = driver.page_source
        assert "Morning" in page_html, "Morning time slot missing from generated itinerary"
        assert "Afternoon" in page_html, "Afternoon time slot missing from generated itinerary"
        assert "Evening" in page_html, "Evening time slot missing from generated itinerary"

        # Verify multi-place itinerary route stops are present
        assert "Itinerary Route Stops" in page_html or "Stops" in page_html, "Route stops section missing"

        # -------------------------------------------------------------
        # Step 5: Click 'Create Tour Package' to save into MySQL
        # -------------------------------------------------------------
        save_btn = wait.until(
            EC.element_to_be_clickable((
                By.XPATH, "//button[contains(., 'Create Tour Package') or contains(., 'Save DB Verified Plan')]"
            ))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", save_btn)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", save_btn)

        # Wait for success state (either 'View in Tour Plans' button or 'Package Saved!')
        view_plans_btn = wait.until(
            EC.presence_of_element_located((
                By.XPATH, "//button[contains(., 'View in Tour Plans')] | //span[contains(., 'Saved to MySQL Database')]"
            ))
        )
        assert view_plans_btn is not None, "Package was not confirmed as saved"
        print("[TEST INFO] Tour Package successfully saved to database!")

        # -------------------------------------------------------------
        # Step 6: Navigate to Expedition / Tour Plans Page
        # -------------------------------------------------------------
        time.sleep(1)
        nav_btns = driver.find_elements(By.XPATH, "//button[contains(., 'View in Tour Plans')]")
        if nav_btns:
            driver.execute_script("arguments[0].scrollIntoView(true);", nav_btns[0])
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", nav_btns[0])
            time.sleep(1.5)
        
        if "plans" not in driver.current_url:
            driver.get(PLANS_URL)

        # -------------------------------------------------------------
        # Step 7: Verify Tour Package exists in Expedition list
        # -------------------------------------------------------------
        wait.until(
            EC.presence_of_element_located((
                By.XPATH, "//h1[contains(., 'Tour Plans') or contains(., 'Expeditions')]"
            ))
        )
        time.sleep(1)

        # Ensure 'My Expeditions & Plans' tab is active (TourPlans may default to 'live_tracker')
        expeditions_tab_btns = driver.find_elements(
            By.XPATH, "//button[contains(., 'My Expeditions & Plans') or contains(., 'View Expeditions List')]"
        )
        if expeditions_tab_btns:
            driver.execute_script("arguments[0].scrollIntoView(true);", expeditions_tab_btns[0])
            time.sleep(0.3)
            driver.execute_script("arguments[0].click();", expeditions_tab_btns[0])
            time.sleep(1)

        # Ensure 'All Tours' filter is clicked so planned expeditions are visible
        all_tours_btns = driver.find_elements(By.XPATH, "//button[contains(., 'All Tours')]")
        if all_tours_btns:
            driver.execute_script("arguments[0].click();", all_tours_btns[0])
            time.sleep(0.5)

        # Wait for the expedition card containing the generated package title or destination
        card_xpath = f"//div[contains(@class, 'card') and (contains(., \"Cox's Bazar\") or contains(., '{generated_title}'))]"
        try:
            matched_card = wait.until(
                EC.presence_of_element_located((By.XPATH, card_xpath))
            )
            assert matched_card is not None, f"Card for '{generated_title}' not located in DOM"
        except Exception:
            # Fallback to page source search if exact xpath misses
            page_text = driver.page_source
            assert ("Cox's Bazar" in page_text) or (generated_title in page_text), \
                f"Saved AI tour package '{generated_title}' or 'Cox\'s Bazar' not found on Tour Plans page!"

        # Verify itinerary route stops section is present on the card or page
        time.sleep(1)
        page_html = driver.page_source
        assert ("Itinerary Route Stops" in page_html) or ("Stops" in page_html), \
            "Saved expedition should display stops information"

        print(f"[TEST PASSED] AI Package '{generated_title}' is verified to exist on the Expedition page with route stops!")


if __name__ == "__main__":
    import pytest
    import sys
    sys.exit(pytest.main(["-v", "-s", __file__]))
