# NexGenie

This repository contains the source code for NexGenie, an advanced AI-powered chatbot designed to enhance the LearnNexus e-learning portal. Integrated into LearnNexus, NexGenie delivers personalized, interactive support to students, teachers, and administrators, offering tailored course recommendations, and real-time coding assistance.

## Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [Machine Learning Models](#machine-learning-models)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About the Project

NexGenie is an AI-powered chatbot integrated into the LearnNexus Learning Management System (LMS). It provides real-time academic support, coding assistance, and personalized learning guidance directly within the platform, enhancing user engagement and improving the overall learning experience.

## Features

- **Course Guidance**: Suggests relevant courses based on user interests and academic goals.
- **Learning Roadmaps**: Generates personalized step-by-step learning paths tailored to users' career goals or skill development needs.
- **Real-Time Coding Assistance**: Provides immediate solutions to programming problems directly within the LearnNexus platform using AI-generated code snippets and explanations.
- **Seamless Integration**: Fully integrated within the LearnNexus platform for a unified user experience.

## Technologies Used

- **FastAPI**: Web framework for building high-performance APIs.
- **Python**: Core programming language for development.
- **React.js (with Typescript)**: Modern frontend framework for building responsive, scalable UI components.
- **Google Gemini API**: Generates accurate and structured code snippets based on user prompts.
- **SentenceTransformers**: Generates semantic embeddings for course recommendations.
- **FAISS**: Provides fast similarity search over course embeddings.
- **Dialogflow ES**: Manages conversational interactions and user intent parsing.
- **Database and Caching**: MongoDB for data storage, Redis for caching.

## Installation

To set up NexGenie locally, follow these steps:

1. **Clone the repository**:
    ```bash
    git clone https://github.com/SaumiliHaldar/NexGenie.git
    ```
2. **Navigate to the project directory**:
    ```bash
    cd NexGenie
    ```
3. **Create a `.env` file** and add your Gemini API key:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```
4. **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
5. **Run the application**:
    ```bash
    uvicorn app:app --reload
    ```

## Usage

- **Access the LearnNexus platform**: Open your browser and navigate to [http://localhost:8000](http://localhost:8000).
- **Interact with NexGenie**: Use the chatbot integrated within the platform for course recommendations, and coding assistance.

## Machine Learning Models

NexGenie utilizes a range of intelligent AI tools and services to deliver a responsive, contextual, and interactive user experience:

### NLP Models
- **SentenceTransformer (`all-MiniLM-L6-v2`)**: For generating semantic embeddings of user queries and course descriptions to enable contextual understanding.
- **FAISS (Facebook AI Similarity Search)**: For efficient similarity search over embedded course data, ensuring fast and relevant course recommendations.

### Conversational AI Models
- **Dialogflow ES**: Manages intents and dialog flows, structures user input, and integrates seamlessly with the FastAPI backend to handle complex queries and parameters.

### Code Understanding and Generation Models
- **Google Gemini API (`gemini-2.0-flash`)**: For generating clean, structured, and language-specific code snippets based on user prompts.

These models enable NexGenie to:
- Understand and process natural language queries using semantic similarity.
- Provide instant and relevant course recommendations based on context.
- Generate accurate and professional code snippets tailored to user input.
- Offer a conversational interface using Dialogflow for an enhanced user experience.
- Support multiple languages and offer personalized assistance to users.

## Contributing

Contributions are welcome! If you'd like to contribute to NexGenie, please follow these steps:

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request.

Please review the contributing guidelines before submitting a pull request.

## License

NexGenie is licensed under the MIT License. See the `LICENSE` file for more details.

## Contact

For any questions or feedback, please reach out to:

**Name**: Saumili Haldar  
**Email**: haldar.saumili843@gmail.com
