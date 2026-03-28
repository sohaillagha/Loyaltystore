import { Router } from 'express';
import { startChatSession, sendMessage, getChatSession } from '../services/chatService.js';
import { getAllProfiles } from '../config/emotionProfiles.js';

const router = Router();

// GET /api/chat/profiles - List all emotion profiles
router.get('/profiles', (req, res) => {
  res.json(getAllProfiles());
});

// POST /api/chat/start - Start a new chat session
router.post('/start', (req, res) => {
  try {
    const { customerId, productContext } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });

    const session = startChatSession(customerId, productContext || null);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/message - Send a message in a session
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const result = await sendMessage(sessionId, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/session/:id - Get session history
router.get('/session/:id', (req, res) => {
  const session = getChatSession(parseInt(req.params.id));
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

export default router;
