from pathlib import Path
from PIL import Image


card_width = 400
full_quality = 90
small_quality = 85


def convert_card(card_path):
    try:
        with Image.open(card_path) as source_image:
            source_image.load()
            has_alpha = "A" in source_image.getbands() or "transparency" in source_image.info
            image_mode = "RGBA" if has_alpha else "RGB"
            full_image = source_image.convert(image_mode)

            card_webp_path = card_path.with_name("card.webp")
            card400_webp_path = card_path.with_name("card400.webp")

            full_image.save(card_webp_path, "WEBP", quality=full_quality, method=6)

            card400_height = max(1, round(full_image.height * card_width / full_image.width))
            small_image = full_image.resize(
                (card_width, card400_height),
                Image.Resampling.LANCZOS
            )
            small_image.save(card400_webp_path, "WEBP", quality=small_quality, method=6)

        card_path.unlink()
        print(f"Готово: {card_path.parent.name}")
        return True
    except Exception as error:
        print(f"Не удалось обработать {card_path}: {error}")
        return False


def main():
    characters_root = Path(__file__).resolve().parent / "characters"

    if not characters_root.is_dir():
        raise SystemExit("Папка characters не найдена рядом с images.py")

    converted_count = 0

    for character_folder in sorted(characters_root.iterdir()):
        if not character_folder.is_dir():
            continue

        card_path = character_folder / "card.png"
        if not card_path.is_file():
            continue

        if convert_card(card_path):
            converted_count += 1

    print(f"Обработано карточек: {converted_count}")


if __name__ == "__main__":
    main()
