# NexGenie

This repository contains the source code for NexGenie, an advanced AI-powered chatbot designed to enhance the LearnNexus e-learning portal. Integrated into LearnNexus, NexGenie delivers personalized, interactive support to students, teachers, and administrators, offering tailored course recommendations, real-time coding assistance, and job/internship guidance.

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

NexGenie is designed to enhance the LearnNexus e-learning portal by offering a chatbot that interacts with users to provide:

- **Course Guidance**: Suggests relevant courses based on user interests and academic goals.
- **Job and Internship Search**: Helps users find job and internship opportunities tailored to their skills and career aspirations.
- **Coding Assistance**: Provides real-time solutions to coding problems and queries directly on the LearnNexus platform, eliminating the need to visit other sites for clarification.

## Features

- **AI-Powered Chatbot**: Engages with users to provide personalized course recommendations, job/internship opportunities, and coding support.
- **Seamless Integration**: Fully integrated within the LearnNexus platform for a unified user experience.
- **Real-Time Coding Assistance**: Offers immediate help with coding problems and queries directly within the platform.
- **Job/Internship Portal Integration**: Assists users in finding job and internship opportunities based on their skills and preferences.

## Technologies Used

- **FastAPI**: Web framework for building high-performance APIs.
- **Python**: Core programming language for development.
- **Generative AI**: Google Gemini API for generating code snippets and solutions.
- **Machine Learning Libraries**: TensorFlow, PyTorch, Scikit-learn for model training.
- **NLP Libraries**: NLTK, spaCy, Transformers for natural language processing.
- **Dialogflow ES**: For creating conversational agents and integrating with the chatbot.
- **Database and Caching**: MongoDB for data storage, MySQL for relational data, Redis for caching.

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
    uvicorn app:app --host 0.0.0.0 --port 8000
    ```

## Usage

- **Access the LearnNexus platform**: Open your browser and navigate to [http://localhost:8000](http://localhost:8000).
- **Interact with NexGenie**: Use the chatbot integrated within the platform for course recommendations, job/internship searches, and coding assistance.
- **Explore job/internship opportunities**: Visit [http://localhost:8000/jobs](http://localhost:8000/jobs) for available positions.

## Machine Learning Models

NexGenie utilizes a range of machine learning models to deliver a robust and interactive experience:

### NLP Models
- **BERT (Bidirectional Encoder Representations from Transformers)**: For deep understanding of natural language queries.
- **RoBERTa (Robustly Optimized BERT Pretraining Approach)**: For enhanced language comprehension and handling diverse queries.
- **Transformers**: For tasks such as text classification and language translation.
- **spaCy**: For tokenization, entity recognition, and language modeling.

### Conversational AI Models
- **Seq2Seq (Sequence-to-Sequence) Models**: For generating coherent and contextually appropriate responses.
- **Encoder-Decoder Models**: For accurately interpreting and responding to user queries.
- **Generative Adversarial Networks (GANs)**: For creating empathetic and personalized responses.

### Code Understanding and Generation Models
- **CodeBERT (Code Embeddings from Transformers)**: For understanding coding concepts and languages.
- **Graph Neural Networks (GNNs)**: For analyzing and understanding code structures and relationships.
- **Sequence-to-Sequence Models**: For generating code snippets and solutions.
- **Google Gemini API**: For generating well-structured code snippets based on user inputs.

### Problem-Solving Models
- **Decision Trees**: For identifying problem types and suggesting solutions.
- **Random Forest**: For classifying problems and recommending approaches.
- **Neural Networks (e.g., Multilayer Perceptron)**: For solving complex problems.

### Multilingual Support Models
- **Machine Translation Models**: For translating user queries and chatbot responses across different languages.
- **Language Identification Models**: For detecting and adapting to user language preferences.

These models enable NexGenie to:
- Understand and process complex coding queries and problems.
- Provide formal, professional, and empathetic responses.
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