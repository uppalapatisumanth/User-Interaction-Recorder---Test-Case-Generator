# User Interaction Recorder - Test Case Generator

## AI-Generated Project

This project was created entirely using AI tools (ChatGPT, Trae AI, and Perplexity.ai) without writing any manual code. It demonstrates the power of AI-assisted development and prompt engineering to create functional software solutions.

The browser extension automatically captures user interactions on web pages and generates structured test cases, streamlining the QA process.

## What Is This Tool?

The User Interaction Recorder is a browser extension and server application that automatically captures user interactions on web pages and converts them into structured test cases. It's designed to solve common testing challenges faced by QA teams in software development companies.

## Common Testing Challenges Addressed

### Time Waste in Manual Test Case Creation
- **Problem**: QA engineers spend 30-40% of their time manually writing test cases based on user flows
- **Solution**: This tool automatically records all interactions and generates test cases in real-time

### Inconsistent Test Case Documentation
- **Problem**: Different testers document test steps in different formats and levels of detail
- **Solution**: Standardized, automatically generated test cases with consistent format and detail level

### Missed Edge Cases
- **Problem**: Manual test case creation often misses important edge cases and user paths
- **Solution**: Captures all interactions exactly as performed, ensuring complete coverage

### Difficulty Reproducing Issues
- **Problem**: Developers struggle to reproduce issues reported by testers
- **Solution**: Precise recording of actions with XPaths, element identifiers, and values

### Time-Consuming Test Maintenance
- **Problem**: Updating test cases when UI changes is labor-intensive
- **Solution**: Easily re-record flows when interfaces change

## How to Use
Browser Extension Installation
## 🚀 How to Install This Chrome Extension

Follow these steps to add the extension manually:

1. Download or clone this repository:
   - Click **Code → Download ZIP**
   - Extract the ZIP file on your computer

2. Open **Google Chrome** and go to:

3. Enable **Developer Mode** (top-right corner).

4. Click **Load unpacked** button.

5. Select the extracted project folder (the one that contains `manifest.json`).

6. The extension will be added to Chrome.
- You can see the extension icon in the toolbar (top-right).
- Pin it if needed for quick access.
7. Download the Node.js after check in cmd node -v  

### Installation
open the CMD go into the folder and make server setup.
1. **Server Setup**: 
A) npm install express or 
B) npm install
C) npm start


## Generating Selenium Scripts

This tool can automatically generate a Python Selenium script from your recorded actions.

1. **Record Actions**: Use the browser extension to record a user flow on any website.
2. **Open Dashboard**: Navigate to `http://localhost:3000` to see the recorded test cases.
3. **Generate Script**: Click the "Generate Selenium Code" button.
4. **Find Your Files**: The generated script and a folder for screenshots will be saved in the `generated-scripts` directory in the project's root.

### Running the Generated Script

To run the generated test script, you'll need:

- Python 3
- The `pytest` framework and `selenium` library. Install them with pip:
  ```bash
  pip install pytest selenium
  ```
- A WebDriver for your browser (e.g., ChromeDriver).

Execute the script from your terminal using the `pytest` command:

```bash
pytest generated-scripts/your_test_script_name.py
```

### How It Works: Intelligent Form Handling

The script generator is designed to be robust. It automatically detects when a `click` on a submit button is followed by a `formSubmit` event. Instead of creating two separate steps, it combines them into a single `click` action and adds a 2-second pause to allow the page to load, preventing element-not-found errors.

---

<img width="2775" height="6192" alt="image" src="https://github.com/user-attachments/assets/86c97616-970d-4422-a99d-125f9e7e6f94" />

